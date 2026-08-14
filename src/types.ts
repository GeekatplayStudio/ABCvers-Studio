/**
 * ABCvers Studio - shared domain types.
 * Geekatplay Studio / Vladimir Chopine.
 */

export type MediaKind = 'video' | 'image'

export type MediaStatus = 'loading' | 'ready' | 'error'

/**
 * How an 'image' item's pixels actually get decoded. `native` is a plain
 * `<img>` - the overwhelming majority of stills. `exr` and `dng` route
 * through the hand-written decoders in `lib/exr.ts` / `lib/dng.ts`, since no
 * browser decodes either format itself. Always `null` for video items.
 */
export type ImageDecoder = 'native' | 'exr' | 'dng'

export interface MediaMeta {
  /** Intrinsic pixel width of the decoded media (the *displayed* picture - a DNG preview's own size, not necessarily the sensor's). */
  width: number
  /** Intrinsic pixel height of the decoded media. */
  height: number
  /** Duration in seconds. Always 0 for images. */
  duration: number
  /** Estimated frames per second. 0 for images until measured. */
  fps: number
  /**
   * True capture resolution, only set for a DNG whose embedded preview is
   * smaller than the sensor - informational only, never used for layout.
   */
  sensorWidth?: number
  sensorHeight?: number
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
  /** null for video; for images, which decode path renders this item. */
  imageDecoder: ImageDecoder | null
  /** EXR exposure adjustment, in stops. Meaningless outside imageDecoder 'exr'. */
  exposure: number
  /**
   * Free-text note on how long this asset took to render, entered by hand -
   * this app has no way to know that itself. Session-only: gone with the
   * item, and never written anywhere that survives a page refresh.
   */
  renderTime: string
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

/**
 * A single freehand annotation, drawn on the overlay that sits above every
 * panel at once - not owned by any one panel, which is what lets a stroke
 * (an arrow, say) cross panel boundaries to point from one to another.
 */
export interface Stroke {
  id: string
  color: string
  /** Normalized 0..1 fractions of the drawing layer's own box, in drag order. */
  points: Point[]
}

export interface Size {
  width: number
  height: number
}
