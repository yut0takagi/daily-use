import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

export function todaySlug(date = new Date()) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export function toRfc2822(date = new Date()) {
  return date.toUTCString()
}

export function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|\n\r]/g, '-').slice(0, 120)
}

export function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mdEscape(text) {
  return text.replace(/[<>]/g, (m) => (m === '<' ? '&lt;' : '&gt;'))
}

export function assertEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Environment variable ${name} is required`)
  return v
}

export function joinUrl(base, ...parts) {
  const p = parts.map((s) => String(s).replace(/^\/+|\/+$/g, '')).join('/')
  return base.replace(/\/$/, '') + '/' + p
}

