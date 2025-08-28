import fs from 'node:fs/promises'
import path from 'node:path'
import { fileExists, toRfc2822 } from './utils.js'

const RSS_PATH = path.join('public', 'podcast.xml')

export async function ensureRssTemplate({ siteTitle, siteLink, siteDescription, language = 'ja-jp', author, imageUrl, explicit = 'false' }) {
  if (await fileExists(RSS_PATH)) return
  const itunesNS = 'http://www.itunes.com/dtds/podcast-1.0.dtd'
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
    <itunes:explicit>${explicit}</itunes:explicit>
  </channel>
</rss>
`
  await fs.writeFile(RSS_PATH, xml, 'utf8')
}

export async function appendItemToRss({ title, description, enclosureUrl, pubDate, guid, link }) {
  let xml = await fs.readFile(RSS_PATH, 'utf8')
  // Insert before closing </channel></rss>
  const item = `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(description)}</description>
      <enclosure url="${escapeXml(enclosureUrl)}" type="audio/mpeg" />
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
