import { describe, expect, it } from 'vitest'
import {
  clampRect,
  composeZoom,
  contentBox,
  isFullRect,
  panRect,
  rectFromDrag,
  rectToTransform,
  transformToCss,
  viewToContent,
  zoomFactor,
  zoomRectBy,
} from './zoom'
import { MAX_ZOOM_SCALE } from './guards'
import type { Rect, Size } from '../types'

const BOX: Size = { width: 800, height: 450 }

describe('clampRect', () => {
  it('keeps rects inside the unit square without resizing them', () => {
    const r = clampRect({ x: 0.9, y: 0.9, w: 0.4, h: 0.4 })
    expect(r.w).toBeCloseTo(0.4)
    expect(r.x).toBeCloseTo(0.6)
    expect(r.y).toBeCloseTo(0.6)
  })

  it('refuses degenerate sizes', () => {
    const r = clampRect({ x: 0.5, y: 0.5, w: 0, h: -1 })
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
  })
})

describe('rectFromDrag', () => {
  it('normalizes against the content box regardless of drag direction', () => {
    const a = rectFromDrag({ x: 600, y: 300 }, { x: 200, y: 100 }, BOX)
    const b = rectFromDrag({ x: 200, y: 100 }, { x: 600, y: 300 }, BOX)
    expect(a).toEqual(b)
    expect(a?.x).toBeCloseTo(0.25)
    expect(a?.w).toBeCloseTo(0.5)
  })

  it('ignores a click or a twitch', () => {
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 101, y: 101 }, BOX)).toBeNull()
  })
})

describe('rectToTransform', () => {
  it('is the identity for a full-frame rect', () => {
    expect(rectToTransform(null, BOX)).toEqual({ scale: 1, x: 0, y: 0 })
    expect(rectToTransform({ x: 0, y: 0, w: 1, h: 1 }, BOX).scale).toBe(1)
  })

  it('magnifies so the whole selection stays visible', () => {
    const rect: Rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.25 }
    const t = rectToTransform(rect, BOX)
    // contain: limited by the wider of the two dimensions
    expect(t.scale).toBeCloseTo(2)
  })

  it('centres the selection', () => {
    const rect: Rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }
    const t = rectToTransform(rect, BOX)
    const centreX = (rect.x + rect.w / 2) * BOX.width * t.scale + t.x
    expect(centreX).toBeCloseTo(BOX.width / 2)
  })

  it('never exposes empty gutters at the edges', () => {
    const t = rectToTransform({ x: 0, y: 0, w: 0.2, h: 0.2 }, BOX)
    expect(t.x).toBeLessThanOrEqual(0)
    expect(t.y).toBeLessThanOrEqual(0)
    expect(t.x).toBeGreaterThanOrEqual(BOX.width * (1 - t.scale) - 0.001)
  })

  it('caps magnification', () => {
    const t = rectToTransform({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 }, BOX)
    expect(t.scale).toBeLessThanOrEqual(MAX_ZOOM_SCALE)
  })

  it('produces a GPU friendly transform string', () => {
    expect(transformToCss({ scale: 2, x: -10, y: -5 })).toBe(
      'translate3d(-10.000px, -5.000px, 0) scale(2.00000)',
    )
  })
})

describe('synchronization invariant', () => {
  it('maps the same rect to the same relative region in differently sized panels', () => {
    const rect: Rect = { x: 0.3, y: 0.1, w: 0.2, h: 0.2 }
    const uhd: Size = { width: 1600, height: 900 }
    const small: Size = { width: 400, height: 225 }

    const a = rectToTransform(rect, uhd)
    const b = rectToTransform(rect, small)

    expect(a.scale).toBeCloseTo(b.scale)
    // Translation scales with the panel, so the framing is identical.
    expect(a.x / uhd.width).toBeCloseTo(b.x / small.width)
    expect(a.y / uhd.height).toBeCloseTo(b.y / small.height)
  })
})

describe('viewToContent / composeZoom', () => {
  it('round-trips through the transform', () => {
    const rect: Rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }
    const t = rectToTransform(rect, BOX)
    const point = { x: 0.5 * BOX.width, y: 0.5 * BOX.height }
    const content = viewToContent(point, BOX, t)
    expect(content.x).toBeCloseTo(rect.x + rect.w / 2)
    expect(content.y).toBeCloseTo(rect.y + rect.h / 2)
  })

  it('composes a marquee with the existing zoom', () => {
    const current: Rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
    const next = composeZoom({ x: 0, y: 0 }, { x: BOX.width, y: BOX.height }, BOX, current)
    expect(next).not.toBeNull()
    // Selecting the whole view while zoomed cannot select more than the source.
    expect(next!.w).toBeLessThanOrEqual(1)
    expect(next!.w).toBeGreaterThan(current.w * 0.9)
  })

  it('rejects a marquee that is only a click', () => {
    expect(composeZoom({ x: 10, y: 10 }, { x: 12, y: 12 }, BOX, null)).toBeNull()
  })
})

describe('panRect', () => {
  it('moves the rect opposite the drag and stays in bounds', () => {
    const rect: Rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }
    const moved = panRect(rect, -80, 0, BOX)
    expect(moved.x).toBeGreaterThan(rect.x)
    const pinned = panRect(rect, 10_000, 10_000, BOX)
    expect(pinned.x).toBe(0)
    expect(pinned.y).toBe(0)
  })
})

describe('zoomRectBy', () => {
  it('zooms in and out around the centre', () => {
    const inward = zoomRectBy(null, 2)
    expect(inward.w).toBeCloseTo(0.5)
    expect(inward.x).toBeCloseTo(0.25)
    const back = zoomRectBy(inward, 0.5)
    expect(isFullRect(back)).toBe(true)
  })

  it('honours a focal point', () => {
    const r = zoomRectBy(null, 2, { x: 0, y: 0 })
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(0)
  })

  it('reports the magnification factor', () => {
    expect(zoomFactor(null)).toBe(1)
    expect(zoomFactor({ x: 0, y: 0, w: 0.5, h: 0.5 })).toBeCloseTo(2)
  })
})

describe('contentBox', () => {
  it('letterboxes a wide clip in a square viewport', () => {
    const box = contentBox({ width: 500, height: 500 }, 16 / 9)
    expect(box.width).toBe(500)
    expect(box.height).toBeCloseTo(281.25)
  })

  it('pillarboxes a tall clip in a wide viewport', () => {
    const box = contentBox({ width: 1000, height: 400 }, 9 / 16)
    expect(box.height).toBe(400)
    expect(box.width).toBeCloseTo(225)
  })

  it('is a no-op when the ratios already match', () => {
    const box = contentBox({ width: 1600, height: 900 }, 16 / 9)
    expect(box.width).toBeCloseTo(1600)
    expect(box.height).toBeCloseTo(900)
  })

  it('survives a zero-sized or unmeasured viewport', () => {
    expect(contentBox({ width: 0, height: 0 }, 1.78)).toEqual({ width: 0, height: 0 })
    expect(contentBox({ width: 100, height: 100 }, 0)).toEqual({ width: 100, height: 100 })
  })
})
