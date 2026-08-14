/**
 * Zoom geometry.
 *
 * A zoom is stored once, globally, as a normalized rectangle (0..1) relative to
 * each panel's *content box* - the area the media actually occupies after
 * letterboxing. Because it is normalized to content rather than to pixels, the
 * exact same rectangle means "the same part of the picture" in every panel,
 * whatever each source resolution or panel size happens to be. That is what
 * makes the magnification synchronized across mixed 4K / HD / vertical sources.
 */

import { clamp, MAX_ZOOM_SCALE, MIN_ZOOM_FRACTION } from './guards'
import type { Point, Rect, Size } from '../types'

export const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 }

export function isFullRect(rect: Rect | null): boolean {
  if (!rect) return true
  return rect.x <= 0.0001 && rect.y <= 0.0001 && rect.w >= 0.9999 && rect.h >= 0.9999
}

/** Keep a rect inside the unit square without changing its size. */
export function clampRect(rect: Rect): Rect {
  const w = clamp(rect.w, MIN_ZOOM_FRACTION, 1)
  const h = clamp(rect.h, MIN_ZOOM_FRACTION, 1)
  return {
    w,
    h,
    x: clamp(rect.x, 0, 1 - w),
    y: clamp(rect.y, 0, 1 - h),
  }
}

/**
 * Build a normalized rect from two pointer positions inside a content box.
 * Returns null when the drag was too small to be a deliberate selection
 * (a click, or a twitch) so the caller can ignore it.
 */
export function rectFromDrag(start: Point, end: Point, box: Size): Rect | null {
  if (box.width <= 0 || box.height <= 0) return null
  const x1 = clamp(Math.min(start.x, end.x) / box.width, 0, 1)
  const x2 = clamp(Math.max(start.x, end.x) / box.width, 0, 1)
  const y1 = clamp(Math.min(start.y, end.y) / box.height, 0, 1)
  const y2 = clamp(Math.max(start.y, end.y) / box.height, 0, 1)
  const w = x2 - x1
  const h = y2 - y1
  if (w < MIN_ZOOM_FRACTION || h < MIN_ZOOM_FRACTION) return null
  return clampRect({ x: x1, y: y1, w, h })
}

export interface Transform {
  scale: number
  /** Translation in CSS pixels, applied before the scale with origin 0 0. */
  x: number
  y: number
}

export const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }

/**
 * Turn a normalized rect into a CSS transform that brings that rect to the
 * centre of the box and magnifies it as much as it can while keeping the whole
 * selection visible (contain, never crop the user's selection).
 */
export function rectToTransform(rect: Rect | null, box: Size): Transform {
  if (!rect || isFullRect(rect) || box.width <= 0 || box.height <= 0) return IDENTITY
  const safe = clampRect(rect)
  const scale = clamp(Math.min(1 / safe.w, 1 / safe.h), 1, MAX_ZOOM_SCALE)

  const cx = safe.x + safe.w / 2
  const cy = safe.y + safe.h / 2

  let x = box.width * (0.5 - cx * scale)
  let y = box.height * (0.5 - cy * scale)

  // Never expose empty gutters: the scaled content must cover the box.
  x = clamp(x, box.width * (1 - scale), 0)
  y = clamp(y, box.height * (1 - scale), 0)

  return { scale, x, y }
}

export function transformToCss(t: Transform): string {
  return `translate3d(${t.x.toFixed(3)}px, ${t.y.toFixed(3)}px, 0) scale(${t.scale.toFixed(5)})`
}

/**
 * Pan by a pointer delta measured in CSS pixels of the content box.
 * The rect moves in the opposite direction of the drag, as a hand tool should.
 */
export function panRect(rect: Rect, deltaX: number, deltaY: number, box: Size): Rect {
  if (box.width <= 0 || box.height <= 0) return rect
  const t = rectToTransform(rect, box)
  return clampRect({
    ...rect,
    x: rect.x - deltaX / (box.width * t.scale),
    y: rect.y - deltaY / (box.height * t.scale),
  })
}

/**
 * Wheel / keyboard zoom around a focal point (normalized 0..1). Factor > 1
 * zooms in. Used by ctrl+wheel and the +/- buttons.
 */
export function zoomRectBy(rect: Rect | null, factor: number, focus: Point = { x: 0.5, y: 0.5 }): Rect {
  const base = rect ?? FULL_RECT
  if (!Number.isFinite(factor) || factor <= 0) return base
  const w = clamp(base.w / factor, 1 / MAX_ZOOM_SCALE, 1)
  const h = clamp(base.h / factor, 1 / MAX_ZOOM_SCALE, 1)
  // Keep the focal point pinned to the same place in the view.
  const fx = clamp(focus.x, 0, 1)
  const fy = clamp(focus.y, 0, 1)
  const ax = base.x + base.w * fx
  const ay = base.y + base.h * fy
  return clampRect({ x: ax - w * fx, y: ay - h * fy, w, h })
}

/**
 * Inverse of `rectToTransform`: turn a pixel position inside the content box
 * back into normalized media coordinates. This is what lets a marquee drawn
 * while already zoomed in compose correctly with the existing zoom.
 */
export function viewToContent(point: Point, box: Size, transform: Transform): Point {
  if (box.width <= 0 || box.height <= 0 || transform.scale <= 0) return { x: 0, y: 0 }
  return {
    x: (point.x - transform.x) / (box.width * transform.scale),
    y: (point.y - transform.y) / (box.height * transform.scale),
  }
}

/**
 * Marquee -> new zoom rect, taking the current zoom into account.
 * Returns null when the drag was too small to be intentional.
 */
export function composeZoom(
  start: Point,
  end: Point,
  box: Size,
  current: Rect | null,
  minDragPx = 10,
): Rect | null {
  if (Math.abs(end.x - start.x) < minDragPx || Math.abs(end.y - start.y) < minDragPx) return null
  const transform = rectToTransform(current, box)
  const a = viewToContent(start, box, transform)
  const b = viewToContent(end, box, transform)
  const x1 = clamp(Math.min(a.x, b.x), 0, 1)
  const x2 = clamp(Math.max(a.x, b.x), 0, 1)
  const y1 = clamp(Math.min(a.y, b.y), 0, 1)
  const y2 = clamp(Math.max(a.y, b.y), 0, 1)
  const w = x2 - x1
  const h = y2 - y1
  if (w <= 0 || h <= 0) return null
  return clampRect({ x: x1, y: y1, w, h })
}

/** Human readable magnification for the toolbar readout. */
export function zoomFactor(rect: Rect | null): number {
  if (!rect || isFullRect(rect)) return 1
  const safe = clampRect(rect)
  return clamp(Math.min(1 / safe.w, 1 / safe.h), 1, MAX_ZOOM_SCALE)
}

/**
 * Size of the area the media really occupies inside a viewport, given the
 * media aspect ratio and `object-fit: contain` behaviour. This is the box all
 * zoom coordinates are normalized against.
 */
export function contentBox(viewport: Size, aspect: number): Size {
  if (viewport.width <= 0 || viewport.height <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
    return { width: Math.max(0, viewport.width), height: Math.max(0, viewport.height) }
  }
  const viewportAspect = viewport.width / viewport.height
  if (viewportAspect > aspect) {
    const height = viewport.height
    return { width: height * aspect, height }
  }
  const width = viewport.width
  return { width, height: width / aspect }
}
