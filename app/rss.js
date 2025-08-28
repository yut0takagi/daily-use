import fs from 'node:fs/promises'
import path from 'node:path'
import { fileExists, toRfc2822 } from './utils.js'

const RSS_PATH = path.join('public', 'podcast.xml')

export async function ensureRssTemplate({ siteTitle, siteLink, siteDescription, language = 'ja-jp', author, imageUrl, explicit = 'false', owner, category }) {
  const itunesNS = 'http://www.itunes.com/dtds/podcast-1.0.dtd'
  const catXml = (category && category.primary)
    ? (category.sub
        ? `<itunes:category text="${escapeXml(category.primary)}"><itunes:category text="${escapeXml(category.sub)}" /></itunes:category>`
        : `<itunes:category text="${escapeXml(category.primary)}" />`)
    : ''
  if (!(await fileExists(RSS_PATH))) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="${itunesNS}">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${escapeXml(siteLink)}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>${language}</language>
    <generator>ArxivCaster</generator>
    <lastBuildDate>${toRfc2822()}</lastBuildDate>
    ${author ? `<itunes:author>${escapeXml(author)}</itunes:author>` : ''}
    ${siteDescription ? `<itunes:summary>${escapeXml(siteDescription)}</itunes:summary>` : ''}
    ${imageUrl ? `<itunes:image href="${escapeXml(imageUrl)}" />` : ''}
    ${owner?.email ? `<itunes:owner><itunes:name>${escapeXml(owner.name || '')}</itunes:name><itunes:email>${escapeXml(owner.email)}</itunes:email></itunes:owner>` : ''}
    ${catXml}
    <itunes:explicit>${explicit}</itunes:explicit>
  </channel>
</rss>
`
    await fs.writeFile(RSS_PATH, xml, 'utf8')
    return
  }
  let xml = await fs.readFile(RSS_PATH, 'utf8')
  if (!/xmlns:itunes=/.test(xml)) {
    xml = xml.replace('<rss version="2.0">', `<rss version="2.0" xmlns:itunes="${itunesNS}">`)
  }
  if (author && !/<itunes:author>/.test(xml)) {
    xml = xml.replace(/\n\s*<lastBuildDate>[^<]*<\/lastBuildDate>/, (m) => `${m}\n    <itunes:author>${escapeXml(author)}</itunes:author>`)
  }
  if (siteDescription && !/<itunes:summary>/.test(xml)) {
    xml = xml.replace(/\n\s*<generator>[^<]*<\/generator>\n\s*<lastBuildDate>[^<]*<\/lastBuildDate>/, (m) => m + `\n    <itunes:summary>${escapeXml(siteDescription)}</itunes:summary>`)
  }
  if (imageUrl) {
    if (/<itunes:image\b[^>]*>/.test(xml)) {
      xml = xml.replace(/<itunes:image\b[^>]*>/, `<itunes:image href="${escapeXml(imageUrl)}" />`)
    } else {
      xml = xml.replace(/\n\s*<itunes:explicit>[^<]*<\/itunes:explicit>/, (m) => `\n    <itunes:image href="${escapeXml(imageUrl)}" />${m}`)
    }
  }
  if (owner?.email && !/<itunes:owner>/.test(xml)) {
    const ownerXml = `<itunes:owner><itunes:name>${escapeXml(owner.name || '')}</itunes:name><itunes:email>${escapeXml(owner.email)}</itunes:email></itunes:owner>`
    xml = xml.replace(/\n\s*<itunes:explicit>[^<]*<\/itunes:explicit>/, (m) => `${m}\n    ${ownerXml}`)
  }
  if (category?.primary) {
    if (/<itunes:category\b/.test(xml)) {
      xml = xml.replace(/<itunes:category\b[\s\S]*?<\/itunes:category>/, catXml)
    } else {
      xml = xml.replace(/\n\s*<itunes:explicit>[^<]*<\/itunes:explicit>/, (m) => `${m}\n    ${catXml}`)
    }
  }
  // Update lastBuildDate
  xml = xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, `<lastBuildDate>${toRfc2822()}</lastBuildDate>`)
  // Update channel link if provided
  if (siteLink) {
    xml = xml.replace(/\n\s*<link>[^<]*<\/link>/, `\n    <link>${escapeXml(siteLink)}</link>`)
  }
  await fs.writeFile(RSS_PATH, xml, 'utf8')
}

export async function appendItemToRss({ title, description, enclosureUrl, enclosureLength, pubDate, guid, link }) {
  let xml = await fs.readFile(RSS_PATH, 'utf8')
  // Insert before closing </channel></rss>
  const item = `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(description)}</description>
      <enclosure url="${escapeXml(enclosureUrl)}" type="audio/mpeg" length="${enclosureLength || 0}" />
    </item>
`
  xml = xml.replace(/\n\s*<\/channel>\s*<\/rss>\s*$/s, (m) => `\n${item}  </channel>\n</rss>\n`)
  // Update lastBuildDate
  xml = xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, `<lastBuildDate>${escapeXml(pubDate)}</lastBuildDate>`)
  await fs.writeFile(RSS_PATH, xml, 'utf8')
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
