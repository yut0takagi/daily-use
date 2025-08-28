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

// Deterministic RNG based on string seed (mulberry32)
export function seededRng(seedStr) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let t = h >>> 0
  return function () {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function pickRandom(arr, rnd = Math.random) {
  if (!arr?.length) return { item: undefined, index: -1 }
  const idx = Math.floor(rnd() * arr.length)
  return { item: arr[idx], index: idx }
}
