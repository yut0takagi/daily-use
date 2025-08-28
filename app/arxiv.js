import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })

export async function searchArxiv({ query, max = 1 }) {
  const search = new URL('https://export.arxiv.org/api/query')
  search.searchParams.set('search_query', query)
  search.searchParams.set('sortBy', 'submittedDate')
  search.searchParams.set('sortOrder', 'descending')
  search.searchParams.set('start', '0')
  search.searchParams.set('max_results', String(max))

  const res = await fetch(search, { headers: { 'User-Agent': 'ArxivCaster/0.1 (+https://github.com/)' } })
  if (!res.ok) throw new Error(`arXiv API failed: ${res.status}`)
  const xml = await res.text()
  const data = parser.parse(xml)

  const feed = data.feed || {}
  let entries = feed.entry || []
  if (!Array.isArray(entries)) entries = [entries]

  return entries.map((e) => normalizeEntry(e))
}

function normalizeEntry(e) {
  const authors = Array.isArray(e.author) ? e.author.map((a) => a.name).filter(Boolean) : e.author?.name ? [e.author.name] : []
  const id = e.id
  const link = Array.isArray(e.link) ? (e.link.find((l) => l.rel === 'alternate')?.href || e.link[0]?.href) : e.link?.href
  return {
    id,
    title: e.title?.trim() || '',
    summary: e.summary?.trim() || '',
    updated: e.updated,
    published: e.published,
    authors,
    link: link || id,
    categories: (Array.isArray(e.category) ? e.category : [e.category]).filter(Boolean).map((c) => c.term),
  }
}

