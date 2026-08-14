/**
 * Guardrails: hard limits, input validation and defensive helpers.
 * Everything that can reject bad input lives here so it is easy to test.
 */

import type { ImageDecoder, MediaKind } from '../types'

/** Beyond this the browser starts dropping frames on most machines. */
export const MAX_PANELS = 12

/** Object URLs of huge files exhaust memory; refuse politely instead. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024

export const MIN_VOLUME = 0
export const MAX_VOLUME = 1

/** Smallest marquee (as a fraction of the content box) that counts as a zoom. */
export const MIN_ZOOM_FRACTION = 0.02

/** Upper bound on magnification, to keep the compositor sane. */
export const MAX_ZOOM_SCALE = 40

export const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'mov',
  'webm',
  'ogv',
  'ogg',
  'mkv',
  'avi',
  'mpg',
  'mpeg',
  'ts',
] as const

export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'avif',
  'svg',
  'ico',
  'tif',
  'tiff',
  'exr',
  'dng',
] as const

/** Extensions with no browser-native decode path, routed through lib/exr.ts or lib/dng.ts. */
const EXR_EXTENSIONS = ['exr'] as const
const DNG_EXTENSIONS = ['dng'] as const

/** Which decode path an 'image'-kind file needs, independent of what classified it. */
export function imageDecoderForExtension(name: string): ImageDecoder {
  const ext = extensionOf(name)
  if ((EXR_EXTENSIONS as readonly string[]).includes(ext)) return 'exr'
  if ((DNG_EXTENSIONS as readonly string[]).includes(ext)) return 'dng'
  return 'native'
}

export const MIN_EXPOSURE_STOPS = -8
export const MAX_EXPOSURE_STOPS = 8

/** Coerce any input into a usable exposure adjustment, in stops. */
export function safeExposure(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, MIN_EXPOSURE_STOPS, MAX_EXPOSURE_STOPS)
}

export const ACCEPT_ATTRIBUTE = [
  'video/*',
  'image/*',
  ...VIDEO_EXTENSIONS.map((e) => `.${e}`),
  ...IMAGE_EXTENSIONS.map((e) => `.${e}`),
].join(',')

export type Classification =
  | { ok: true; kind: MediaKind }
  | { ok: false; reason: string }

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

/**
 * Decide whether a dropped/selected file is playable, and as what.
 * MIME type wins; extension is the fallback for files the OS did not tag
 * (very common for .mkv / .mov coming out of NLE exports).
 */
export function classifyFile(file: { name: string; type: string; size: number }): Classification {
  if (file.size === 0) {
    return { ok: false, reason: 'File is empty' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `File is larger than ${MAX_FILE_BYTES / 1024 ** 3} GB` }
  }

  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('video/')) return { ok: true, kind: 'video' }
  if (mime.startsWith('image/')) return { ok: true, kind: 'image' }

  const ext = extensionOf(file.name)
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return { ok: true, kind: 'video' }
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return { ok: true, kind: 'image' }

  return { ok: false, reason: 'Unsupported file type' }
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return value < min ? min : value > max ? max : value
}

/** Coerce any input into a usable 0..1 volume. */
export function safeVolume(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, MIN_VOLUME, MAX_VOLUME)
}

/** Coerce any input into a finite, non-negative time in seconds. */
export function safeTime(value: number, duration = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return 0
  return clamp(value, 0, Number.isFinite(duration) ? Math.max(0, duration) : Number.MAX_SAFE_INTEGER)
}

/** Frame rates outside this window are always a probe artefact. */
export function safeFps(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return clamp(value, 1, 480)
}

export class GuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardError'
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GuardError(message)
}
