import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, todaySlug, fileExists, joinUrl, assertEnv } from './utils.js'
import { searchArxiv } from './arxiv.js'
import { generateSummaryJa, generatePodcastScriptJa, synthesizeTtsMp3 } from './llm.js'
import { ensureRssTemplate, appendItemToRss } from './rss.js'

const ARXIV_QUERY = process.env.ARXIV_QUERY || 'cat:cs.LG'
const ARXIV_MAX = parseInt(process.env.ARXIV_MAX || '1', 10)
const SITE_BASE_URL = process.env.SITE_BASE_URL || ''

async function main() {
  const slug = todaySlug(new Date())
  const postsDir = path.join('public', 'posts')
  const episodesDir = path.join('public', 'episodes')
  await ensureDir(postsDir)
  await ensureDir(episodesDir)

  const postPath = path.join(postsDir, `${slug}.md`)
  const FORCE_RUN = String(process.env.FORCE_RUN || '').toLowerCase() === 'true'
  if (!FORCE_RUN && await fileExists(postPath)) {
    console.log(`[skip] Already published for ${slug}`)
    return
  }

  const siteTitle = 'ArxivCaster'
  const siteLink = SITE_BASE_URL || 'https://example.com'
  const siteDescription = 'Daily summaries of arXiv papers with podcast audio.'
  await ensureRssTemplate({ siteTitle, siteLink, siteDescription })

  console.log(`[arxiv] query: ${ARXIV_QUERY}, max: ${ARXIV_MAX}`)
  const entries = await searchArxiv({ query: ARXIV_QUERY, max: ARXIV_MAX })
  if (!entries.length) {
    console.log('No arXiv results')
    return
  }

  // Take the first entry for today
  const entry = entries[0]
  console.log(`[paper] ${entry.title}`)

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

  const pubDate = new Date().toUTCString()
  await appendItemToRss({
    title: entry.title,
    description: summaryJa,
    enclosureUrl: audioUrl,
    pubDate,
    guid: `arxivcaster-${slug}`,
    link: SITE_BASE_URL ? joinUrl(SITE_BASE_URL, 'posts', `${slug}.html`) : entry.link,
  })
  console.log('[rss] updated public/podcast.xml')

  // Rebuild public index.json for the site
  await rebuildIndexJson(postsDir)
  console.log('[site] updated public/index.json')
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
