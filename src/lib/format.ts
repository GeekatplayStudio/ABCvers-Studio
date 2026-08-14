/**
 * Display formatters for the media info strips and the transport bar.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(decimals)} ${BYTE_UNITS[unit]}`
}

function pad(n: number, width = 2): string {
  return Math.floor(Math.abs(n)).toString().padStart(width, '0')
}

/**
 * `1:02.480` style clock, used under the scrubbers.
 * Works in whole milliseconds so binary fractions like 62.48 do not round
 * down to `.479`.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000'
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSeconds = (totalMs - ms) / 1000
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const head = h > 0 ? `${h}:${pad(m)}` : `${m}`
  return `${head}:${pad(s)}.${pad(ms, 3)}`
}

/** Floating point time * rate lands a hair under the frame it really is. */
const FRAME_EPSILON = 1e-6

/** SMPTE-ish `HH:MM:SS:FF` timecode. Falls back to 00 frames without an fps. */
export function formatTimecode(seconds: number, fps: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const rate = Number.isFinite(fps) && fps > 0 ? fps : 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const f =
    rate > 0
      ? Math.min(Math.round(rate) - 1, Math.max(0, Math.floor((seconds % 1) * rate + FRAME_EPSILON)))
      : 0
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`
}

/** Compact duration for the info strip: `12.480s`, `1m 04s`, `1h 02m`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  if (seconds < 60) return `${seconds.toFixed(2)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${pad(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${pad((seconds % 3600) / 60)}m`
}

/** Greatest common divisor based ratio, e.g. 1920x1080 -> "16:9". */
export function aspectLabel(width: number, height: number): string {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return '--'
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const d = gcd(Math.round(width), Math.round(height)) || 1
  const w = Math.round(width) / d
  const h = Math.round(height) / d
  // Ratios like 1279:719 are noise - fall back to a decimal form.
  if (w > 40 || h > 40) return `${(width / height).toFixed(2)}:1`
  return `${w}:${h}`
}

export function formatDate(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '--'
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Megapixels, handy for stills. */
export function formatResolution(width: number, height: number): string {
  if (!width || !height) return '--'
  return `${Math.round(width)} x ${Math.round(height)}`
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value * 100)}%`
}

/** Truncate long file names in the middle so the extension stays visible. */
export function middleTruncate(text: string, max = 34): string {
  if (text.length <= max) return text
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}
