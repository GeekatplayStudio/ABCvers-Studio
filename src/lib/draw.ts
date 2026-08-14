/**
 * Freehand annotation primitives: the pen's colour palette, path smoothing,
 * and the guardrails around how much a single session can accumulate.
 *
 * Deliberately has no idea about React, SVG elements, or the DOM - it turns
 * point arrays into path data and nothing else, so it is trivial to test.
 */

import type { Point } from '../types'

export interface PenColorOption {
  value: string
  label: string
}

/** Explicitly requested: black, white, orange, cyan, plus a few more for range. */
export const PEN_COLORS: PenColorOption[] = [
  { value: '#ffffff', label: 'White' },
  { value: '#000000', label: 'Black' },
  { value: '#e8813a', label: 'Orange' },
  { value: '#22d3ee', label: 'Cyan' },
  { value: '#ef4444', label: 'Red' },
  { value: '#facc15', label: 'Yellow' },
  { value: '#4ade80', label: 'Green' },
  { value: '#ec4899', label: 'Magenta' },
]

/** Orange, to match the app's own accent rather than an arbitrary pick. */
export const DEFAULT_PEN_COLOR = '#e8813a'

/** Stroke width in SVG user units, which the drawing layer sets 1:1 with CSS pixels. */
export const STROKE_WIDTH = 4

/** However long a single drag runs, stop growing the point array past this. */
export const MAX_POINTS_PER_STROKE = 4000

/** Older annotations quietly retire past this count, so the layer never grows unbounded. */
export const MAX_STROKES = 300

/**
 * Points closer together than this (as a fraction of the drawing box) are not
 * worth recording separately - keeps a slow, careful drag from bloating the
 * point array without any visible effect on the smoothed path.
 */
export const MIN_POINT_DISTANCE = 0.004

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

let strokeCounter = 0

export function createStrokeId(): string {
  strokeCounter += 1
  return `stroke_${strokeCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Test-only: keep generated ids predictable across test cases. */
export function __resetStrokeCounter(): void {
  strokeCounter = 0
}

/** Normalized 0..1 storage -> actual pixel coordinates in the current box. */
export function scalePoints(points: readonly Point[], width: number, height: number): Point[] {
  return points.map((p) => ({ x: p.x * width, y: p.y * height }))
}

/**
 * Turns a raw point sequence into a smooth SVG path: a quadratic Bezier
 * through the midpoint of every consecutive pair, which is the standard,
 * cheap way to take jittery freehand input and render it without visible
 * corners. Points are taken as already being in the coordinate space the
 * caller wants drawn (typically pixels, after scaling normalized 0..1
 * storage by the current box size) - this function is purely geometric.
 */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]!
    // A single point (a click, not a drag) still has to paint something -
    // an essentially-zero-length line renders as a dot with round caps.
    return `M ${p.x} ${p.y} L ${p.x} ${p.y}`
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]!
    const next = points[i + 1]!
    const midX = (current.x + next.x) / 2
    const midY = (current.y + next.y) / 2
    d += ` Q ${current.x} ${current.y} ${midX} ${midY}`
  }
  const last = points[points.length - 1]!
  d += ` L ${last.x} ${last.y}`
  return d
}
