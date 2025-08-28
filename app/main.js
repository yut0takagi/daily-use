import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, todaySlug, fileExists, joinUrl, assertEnv, seededRng, pickRandom, uniqueBy } from './utils.js'
import { searchArxiv } from './arxiv.js'
import { generateSummaryJa, generatePodcastScriptJa, synthesizeTtsMp3 } from './llm.js'
import { ensureRssTemplate, appendItemToRss } from './rss.js'
import { maybePublishQiita } from './qiita.js'

const ARXIV_QUERY = process.env.ARXIV_QUERY || 'cat:cs.LG'
// Backward compat: prefer ARXIV_POOL_SIZE, fallback to ARXIV_MAX
const ARXIV_POOL_SIZE = parseInt(process.env.ARXIV_POOL_SIZE || process.env.ARXIV_MAX || '200', 10)
const SITE_BASE_URL = process.env.SITE_BASE_URL || ''
const PODCAST_TITLE = process.env.PODCAST_TITLE || 'ArxivCaster'
const PODCAST_DESCRIPTION = process.env.PODCAST_DESCRIPTION || 'Daily summaries of arXiv papers with podcast audio.'
const PODCAST_AUTHOR = process.env.PODCAST_AUTHOR || ''
const PODCAST_IMAGE_URL = process.env.PODCAST_IMAGE_URL || (SITE_BASE_URL ? joinUrl(SITE_BASE_URL, 'cover.png') : '')
const DEDUP_HISTORY = String(process.env.DEDUP_HISTORY || 'true').toLowerCase() !== 'false'
const HISTORY_WINDOW_DAYS = parseInt(process.env.HISTORY_WINDOW_DAYS || '0', 10) // 0 = all time
const ARXIV_RANDOM_MODE = (process.env.ARXIV_RANDOM_MODE || 'daily').toLowerCase() // 'daily' | 'true_random'

async function main() {
  const now = new Date()
  const postsDir = path.join('public', 'posts')
  const episodesDir = path.join('public', 'episodes')
  await ensureDir(postsDir)
  await ensureDir(episodesDir)
  const FORCE_RUN = String(process.env.FORCE_RUN || '').toLowerCase() === 'true'

  const siteTitle = PODCAST_TITLE
  const siteLink = SITE_BASE_URL || 'https://example.com'
  const siteDescription = PODCAST_DESCRIPTION
  await ensureRssTemplate({ siteTitle, siteLink, siteDescription, author: PODCAST_AUTHOR, imageUrl: PODCAST_IMAGE_URL })

  const queries = ARXIV_QUERY.split('||').map((q) => q.trim()).filter(Boolean)
  console.log(`[arxiv] queries: ${queries.length} item(s), pool: ${ARXIV_POOL_SIZE}`)
  const perQueryMax = Math.max(50, Math.ceil((ARXIV_POOL_SIZE / queries.length) * 1.4))
  let allEntries = []
  for (const q of queries) {
    try {
      const part = await searchArxiv({ query: q, max: perQueryMax })
      allEntries.push(...part)
    } catch (e) {
      console.warn(`[arxiv] query failed: ${q} -> ${String(e)}`)
    }
  }
  let entries = uniqueBy(allEntries, (e) => e.id)
  // Keep freshest first (API is already sorted desc, but merge could change order)
  entries.sort((a, b) => new Date(b.published || b.updated || 0) - new Date(a.published || a.updated || 0))
  entries = entries.slice(0, ARXIV_POOL_SIZE)
  if (!entries.length) {
    console.log('No arXiv results')
    return
  }

  // Filter out entries that were already published (history de-dup)
  if (DEDUP_HISTORY) {
    const existingIds = await collectExistingSafeIds(postsDir)
    const before = entries.length
    const filtered = entries.filter((e) => !existingIds.has(safeIdFromEntry(e)))
    if (filtered.length) {
      entries = filtered
    }
    console.log(`[dedup] filtered ${before - entries.length} seen paper(s); remaining ${entries.length}`)
  }

  const day = todaySlug(now)
  // Pick one entry randomly (deterministic per-day unless true_random)
  const seedStr = ARXIV_RANDOM_MODE === 'true_random' ? null : `${day}:${ARXIV_QUERY}`
  const rnd = seedStr ? seededRng(seedStr) : Math.random
  const { item: entry, index: chosen } = pickRandom(entries, rnd)
  console.log(`[paper] pick #${chosen + 1}/${entries.length}: ${entry.title}`)

  // Build unique slug allowing multiple per-day using arXiv id
  const rawId = String(entry.id || '').split('/abs/').pop() || String(entry.id || '').split('/').pop() || 'paper'
  const safeId = rawId.replace(/[^A-Za-z0-9_.-]/g, '-')
  const slug = `${day}-${safeId}`.toLowerCase()

  const postPath = path.join(postsDir, `${slug}.md`)
  if (!FORCE_RUN && await fileExists(postPath)) {
    console.log(`[skip] Already exists for slug ${slug}`)
    return
  }

  // Ensure API key is present before LLM/TTS calls
  assertEnv('OPENAI_API_KEY')

  const summaryJa = await generateSummaryJa(entry)
  const scriptJa = await generatePodcastScriptJa({ ...entry, summaryJa })

  const mp3Buf = await synthesizeTtsMp3(scriptJa)
  const mp3Name = `${slug}.mp3`
  const mp3Path = path.join(episodesDir, mp3Name)
  await fs.writeFile(mp3Path, mp3Buf)
  console.log(`[audio] wrote ${mp3Path}`)

  const audioUrl = SITE_BASE_URL ? joinUrl(SITE_BASE_URL, 'episodes', mp3Name) : `episodes/${mp3Name}`

  const md = renderPostMarkdown({ slug, entry, summaryJa, scriptJa, audioUrl })
  await fs.writeFile(postPath, md, 'utf8')
  console.log(`[post] wrote ${postPath}`)

  const pubDate = now.toUTCString()
  await appendItemToRss({
    title: entry.title,
    description: summaryJa,
    enclosureUrl: audioUrl,
    pubDate,
    guid: `arxivcaster-${slug}`,
    link: SITE_BASE_URL ? `${joinUrl(SITE_BASE_URL, 'viewer.html')}?slug=${encodeURIComponent(slug)}` : entry.link,
  })
  console.log('[rss] updated public/podcast.xml')

  // Rebuild public index.json for the site
  await rebuildIndexJson(postsDir)
  console.log('[site] updated public/index.json')

  // Optionally publish to Qiita
  const canonicalUrl = SITE_BASE_URL ? `${joinUrl(SITE_BASE_URL, 'viewer.html')}?slug=${encodeURIComponent(slug)}` : ''
  try {
    await maybePublishQiita({ slug, entry, markdown: md, canonicalUrl, audioUrl })
  } catch (e) {
    console.warn(String(e))
  }
}

function safeIdFromEntry(e) {
  const rawId = String(e.id || '').split('/abs/').pop() || String(e.id || '').split('/').pop() || 'paper'
  return rawId.replace(/[^A-Za-z0-9_.-]/g, '-').toLowerCase()
}

async function collectExistingSafeIds(postsDir) {
  const set = new Set()
  try {
    const files = await fs.readdir(postsDir)
    const cutoff = HISTORY_WINDOW_DAYS > 0 ? daysAgoDate(HISTORY_WINDOW_DAYS) : null
    for (const f of files) {
      if (!f.endsWith('.md')) continue
      const base = f.replace(/\.md$/, '')
      const dash = base.indexOf('-')
      if (dash <= 0) continue
      const dayStr = base.slice(0, dash)
      const id = base.slice(dash + 1).toLowerCase()
      if (cutoff) {
        // dayStr is YYYYMMDD in UTC
        const yyyy = parseInt(dayStr.slice(0, 4), 10)
        const mm = parseInt(dayStr.slice(4, 6), 10)
        const dd = parseInt(dayStr.slice(6, 8), 10)
        const d = new Date(Date.UTC(yyyy, mm - 1, dd))
        if (d < cutoff) continue
      }
      if (id) set.add(id)
    }
  } catch {}
  return set
}

function daysAgoDate(n) {
  const now = new Date()
  const ms = now.getTime() - n * 24 * 60 * 60 * 1000
  return new Date(ms)
}

function renderPostMarkdown({ slug, entry, summaryJa, scriptJa, audioUrl }) {
  const { title, authors, link } = entry
  return `---
title: "${escapeMd(title)}"
date: ${new Date().toISOString()}
slug: ${slug}
---

# ${escapeMd(title)}

- 著者: ${authors.join(', ')}
- arXiv: ${link}

## エピソード音声

<audio controls src="${audioUrl}"></audio>

## 要約 (日本語)

${summaryJa}

## Podcast 台本 (全文)

${scriptJa}
`
}

function escapeMd(s) {
  return String(s).replace(/"/g, '\\"')
}

// Run
main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

async function rebuildIndexJson(postsDir) {
  const files = (await fs.readdir(postsDir)).filter((f) => f.endsWith('.md'))
  const items = []
  for (const f of files) {
    const slug = f.replace(/\.md$/, '')
    const p = path.join(postsDir, f)
    const txt = await fs.readFile(p, 'utf8')
    const meta = parseFrontMatter(txt)
    items.push({
      slug,
      title: meta.title || slug,
      date: meta.date || new Date().toISOString(),
      path: `posts/${slug}.md`,
    })
  }
  items.sort((a, b) => (a.slug < b.slug ? 1 : -1))
  const out = { updatedAt: new Date().toISOString(), items }
  await fs.writeFile(path.join('public', 'index.json'), JSON.stringify(out, null, 2))
}

function parseFrontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---/m.exec(text)
  const meta = {}
  if (m) {
    for (const line of m[1].split(/\n/)) {
      const mm = /^(\w+):\s*(.*)$/.exec(line.trim())
      if (mm) meta[mm[1]] = mm[2]?.replace(/^"|"$/g, '')
    }
  }
  return meta
}
