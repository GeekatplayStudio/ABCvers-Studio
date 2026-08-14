/**
 * ABCvers Studio - shared domain types.
 * Geekatplay Studio / Vladimir Chopine.
 */

export type MediaKind = 'video' | 'image'

export type MediaStatus = 'loading' | 'ready' | 'error'

export interface MediaMeta {
  /** Intrinsic pixel width of the decoded media. */
  width: number
  /** Intrinsic pixel height of the decoded media. */
  height: number
  /** Duration in seconds. Always 0 for images. */
  duration: number
  /** Estimated frames per second. 0 for images until measured. */
  fps: number
}

export interface MediaItem {
  id: string
  name: string
  /** Size in bytes. */
  size: number
  mimeType: string
  /** Epoch ms from the source file. */
  lastModified: number
  kind: MediaKind
  /** Object URL for the local file. Revoked on removal. */
  url: string
  status: MediaStatus
  error?: string
  meta: MediaMeta | null
  /** Per-panel volume, 0..1. */
  volume: number
  /** Per-panel mute flag. */
  muted: boolean
  /**
   * Width override set by dragging a splitter, as a width-per-unit-height.
   * `null` means "follow the media / locked aspect ratio", which is what keeps
   * pictures edge to edge with no letterboxing.
   */
  weight: number | null
}

/** How a picture fills its panel when the panel is not its own shape. */
export type FitMode = 'fit' | 'fill'

/** Aspect ratio lock for every panel. `free` follows each media's own ratio. */
export type AspectKey = 'free' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | '2.39:1'

/** Normalized rectangle inside a panel's content box. All values 0..1. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}
