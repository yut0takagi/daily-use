// Qiita auto-publish helper
// Uses environment variables:
// - QIITA_PUBLISH=true|false
// - QIITA_ACCESS_TOKEN=<token>
// - QIITA_TAGS=arxiv,podcast,ml  (comma-separated)
// - QIITA_PRIVATE=true|false
// - QIITA_TITLE_PREFIX=[ArxivCaster]
// Docs: https://qiita.com/api/v2/docs#post-apiv2items

function getEnvBool(name, def = false) {
  const v = (process.env[name] || '').toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return def
}

export async function maybePublishQiita({ slug, entry, markdown, canonicalUrl, audioUrl }) {
  const enabled = getEnvBool('QIITA_PUBLISH', false)
  const token = process.env.QIITA_ACCESS_TOKEN
  if (!enabled) return { skipped: 'disabled' }
  if (!token) {
    console.warn('[qiita] QIITA_ACCESS_TOKEN missing; skip')
    return { skipped: 'no_token' }
  }
  const prefix = process.env.QIITA_TITLE_PREFIX || '[ArxivCaster] '
  const title = `${prefix}${entry.title}`.slice(0, 120)
  const tags = String(process.env.QIITA_TAGS || 'arxiv,podcast,ml')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((name) => ({ name, versions: [] }))
  const isPrivate = getEnvBool('QIITA_PRIVATE', false)

  // Build body: add header with meta + canonical link + audio
  const audio = audioUrl || (canonicalUrl?.includes('viewer.html') ? canonicalUrl.replace(/viewer\.html\?slug=.*$/, `episodes/${slug}.mp3`) : '')
  const header = [
    `> この記事は自動生成されています — ArxivCaster`,
    `> 論文: ${entry.title}`,
    entry.authors?.length ? `> 著者: ${entry.authors.join(', ')}` : '',
    entry.link ? `> arXiv: ${entry.link}` : '',
    canonicalUrl ? `> Canonical: ${canonicalUrl}` : '',
    audio ? `> Audio: ${audio}` : '',
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const body = `${header}\n${markdown}`

  const res = await fetch('https://qiita.com/api/v2/items', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body,
      tags,
      private: isPrivate,
      coediting: false,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`[qiita] failed: ${res.status} ${txt}`)
  }
  const out = await res.json()
  console.log(`[qiita] posted: ${out.url}`)
  return { url: out.url, id: out.id }
}
