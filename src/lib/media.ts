/**
 * Turning dropped files into MediaItems, and probing them for metadata.
 */

import { classifyFile, safeFps, MAX_PANELS } from './guards'
import type { MediaItem, MediaMeta } from '../types'
import { DEFAULT_FPS } from './sync'

let counter = 0

export function createId(prefix = 'm'): string {
  counter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${counter.toString(36)}_${random}`
}

/** Reset between tests so ids stay predictable. */
export function __resetIdCounter(): void {
  counter = 0
}

export interface RejectedFile {
  name: string
  reason: string
}

export interface IntakeResult {
  accepted: MediaItem[]
  rejected: RejectedFile[]
}

export interface IntakeOptions {
  /** How many panels are already open. */
  existing?: number
  /** Injectable for tests; defaults to URL.createObjectURL. */
  createUrl?: (file: File) => string
}

/**
 * Validate a batch of files and build the items for the ones that pass.
 * Never throws: bad files come back in `rejected` with a readable reason.
 */
export function intakeFiles(files: readonly File[], options: IntakeOptions = {}): IntakeResult {
  const { existing = 0, createUrl = (file: File) => URL.createObjectURL(file) } = options
  const accepted: MediaItem[] = []
  const rejected: RejectedFile[] = []

  for (const file of files) {
    if (existing + accepted.length >= MAX_PANELS) {
      rejected.push({ name: file.name, reason: `Panel limit reached (${MAX_PANELS})` })
      continue
    }
    const verdict = classifyFile(file)
    if (!verdict.ok) {
      rejected.push({ name: file.name, reason: verdict.reason })
      continue
    }
    let url: string
    try {
      url = createUrl(file)
    } catch {
      rejected.push({ name: file.name, reason: 'Could not open file' })
      continue
    }
    accepted.push({
      id: createId(verdict.kind === 'video' ? 'v' : 'i'),
      name: file.name,
      size: file.size,
      mimeType: file.type || `${verdict.kind}/unknown`,
      lastModified: file.lastModified,
      kind: verdict.kind,
      url,
      status: 'loading',
      meta: null,
      volume: 1,
      muted: false,
      weight: null,
    })
  }

  return { accepted, rejected }
}

/** Walk a DataTransfer, including directories dropped from the OS. */
export async function filesFromDataTransfer(transfer: DataTransfer): Promise<File[]> {
  const items = transfer.items
  if (!items || items.length === 0) return Array.from(transfer.files ?? [])

  const entries: FileSystemEntry[] = []
  const plain: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) entries.push(entry)
    else {
      const file = item.getAsFile()
      if (file) plain.push(file)
    }
  }
  if (entries.length === 0) return plain.length ? plain : Array.from(transfer.files ?? [])

  const out: File[] = []
  await Promise.all(entries.map((entry) => walkEntry(entry, out)))
  return out.length ? out : Array.from(transfer.files ?? [])
}

async function walkEntry(entry: FileSystemEntry, out: File[], depth = 0): Promise<void> {
  if (depth > 4) return // guardrail: never recurse into deep trees
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      ;(entry as FileSystemFileEntry).file(resolve, () => resolve(null))
    })
    if (file) out.push(file)
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]))
    })
    await Promise.all(children.map((child) => walkEntry(child, out, depth + 1)))
  }
}

export function metaFromVideo(video: HTMLVideoElement): MediaMeta {
  return {
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    fps: 0,
  }
}

export function metaFromImage(image: HTMLImageElement): MediaMeta {
  return {
    width: image.naturalWidth || 0,
    height: image.naturalHeight || 0,
    duration: 0,
    fps: 0,
  }
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/**
 * Estimate frame rate from real presented frames.
 *
 * There is no browser API that reports a file's frame rate, so we watch
 * `requestVideoFrameCallback` and take the median gap between presentation
 * timestamps - medians shrug off the occasional dropped frame. Falls back to
 * 30 fps when the API is missing (Firefox), the sample is too noisy, or - the
 * common case - the clip never presented a second frame because it was never
 * playing. That last case is why callers should generally prefer `primeFps`,
 * which guarantees real frames get presented before this runs.
 */
export function probeFps(video: HTMLVideoElement, samples = 12, timeoutMs = 2000): Promise<number> {
  const el = video as RVFCVideo
  if (typeof el.requestVideoFrameCallback !== 'function') {
    return Promise.resolve(DEFAULT_FPS)
  }

  return new Promise<number>((resolve) => {
    const gaps: number[] = []
    let previous = -1
    let handle = 0
    let done = false

    const finish = (value: number) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (handle && typeof el.cancelVideoFrameCallback === 'function') {
        el.cancelVideoFrameCallback(handle)
      }
      resolve(safeFps(value) || DEFAULT_FPS)
    }

    const timer = setTimeout(() => finish(median(gaps)), timeoutMs)

    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (previous >= 0) {
        const delta = meta.mediaTime - previous
        if (delta > 0.0005 && delta < 0.5) gaps.push(1 / delta)
      }
      previous = meta.mediaTime
      if (gaps.length >= samples) {
        finish(median(gaps))
        return
      }
      handle = el.requestVideoFrameCallback!(onFrame)
    }

    handle = el.requestVideoFrameCallback!(onFrame)
  })
}

export interface PrimeFpsOptions {
  samples?: number
  timeoutMs?: number
}

/**
 * Get a trustworthy frame-rate reading right after a clip loads, instead of
 * whatever `probeFps` happens to see.
 *
 * A freshly loaded clip is paused - the studio does not autoplay - and
 * `requestVideoFrameCallback` only fires when a *new* frame is actually
 * presented. Calling `probeFps` on a paused clip therefore almost always
 * times out with zero samples and quietly reports the DEFAULT_FPS fallback
 * as if it were measured, which is indistinguishable from a real 30fps clip
 * in the UI. This runs a brief, muted priming playback purely to collect a
 * few genuine frames, then restores the clip to exactly where it was. If
 * autoplay is refused for any reason it falls back to the plain (passive)
 * probe rather than failing.
 *
 * Deliberately plays at the normal rate rather than sped up: a decoder that
 * cannot keep up in real time (slow hardware, a virtualized/headless
 * environment, a very heavy source) silently drops presented frames to catch
 * up, which doubles or triples the *apparent* gap between the frames that do
 * get presented - and this measurement has exactly one job, so a probe that
 * quietly reports half the true rate is a worse bug than the slightly longer
 * flash of a normal-speed one.
 */
export async function primeFps(video: HTMLVideoElement, options: PrimeFpsOptions = {}): Promise<number> {
  const { samples = 8, timeoutMs = 900 } = options
  const el = video as RVFCVideo
  if (typeof el.requestVideoFrameCallback !== 'function') {
    return DEFAULT_FPS
  }

  const resumeTime = video.currentTime
  const wasMuted = video.muted

  video.muted = true

  try {
    await video.play()
  } catch {
    video.muted = wasMuted
    return probeFps(video, samples)
  }

  const fps = await probeFps(video, samples, timeoutMs)

  try {
    video.pause()
  } catch {
    /* element may have been detached mid-probe */
  }
  video.currentTime = resumeTime
  video.muted = wasMuted
  return fps
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)
  // Snap onto the nearest standard broadcast rate; probes land within ~2%.
  // Nearest, not first-within-tolerance, because 29.97 and 30 both match.
  const standards = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 120, 144, 240]
  let best = 0
  let bestError = Number.POSITIVE_INFINITY
  for (const standard of standards) {
    const error = Math.abs(value - standard) / standard
    if (error < bestError) {
      bestError = error
      best = standard
    }
  }
  if (bestError < 0.02) return best
  return Math.round(value * 100) / 100
}

/** Media aspect ratio with a sane fallback while metadata is still loading. */
export function aspectOf(item: MediaItem, fallback = 16 / 9): number {
  const meta = item.meta
  if (!meta || !meta.width || !meta.height) return fallback
  return meta.width / meta.height
}
