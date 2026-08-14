/**
 * Panel layout maths.
 *
 * Panels live in flex rows. In `free` aspect mode each panel's default weight
 * is its own aspect ratio, so a row of mixed 16:9 and 9:16 clips shares one
 * height with zero letterboxing and zero gaps between screens. Locked aspect
 * modes give every panel the same weight instead.
 */

import { clamp } from './guards'
import type { AspectKey, MediaItem, Size } from '../types'
import { aspectOf } from './media'

export const ASPECT_OPTIONS: { key: AspectKey; label: string; ratio: number | null }[] = [
  { key: 'free', label: 'Free', ratio: null },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: '21:9', label: '21:9', ratio: 21 / 9 },
  { key: '2.39:1', label: '2.39:1', ratio: 2.39 },
]

export function ratioFor(aspect: AspectKey): number | null {
  return ASPECT_OPTIONS.find((option) => option.key === aspect)?.ratio ?? null
}

/** `auto` picks a column count that keeps panels as large as possible. */
export function autoColumns(count: number): number {
  if (count <= 0) return 1
  if (count <= 4) return count
  if (count <= 6) return 3
  if (count <= 9) return 3
  return 4
}

export function resolveColumns(count: number, columns: number | 'auto'): number {
  if (count <= 0) return 1
  if (columns === 'auto') return autoColumns(count)
  return clamp(Math.round(columns), 1, Math.max(1, count))
}

/** Split items into rows of at most `columns` panels. */
export function chunkRows<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns))
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}

/**
 * The shape a panel's picture area should have: the locked ratio, or the
 * media's own ratio in free mode.
 */
export function panelAspect(item: MediaItem, aspect: AspectKey): number {
  const locked = ratioFor(aspect)
  if (locked) return locked
  return clamp(aspectOf(item), 0.25, 4)
}

/**
 * Width weight for a panel, expressed as a width-per-unit-height. A panel the
 * user has dragged keeps its override; everything else follows `panelAspect`.
 * Since every panel in a row is given the same height, a weight that equals the
 * media ratio produces a box that matches the picture exactly - which is what
 * removes the letterbox bars between neighbouring screens.
 */
export function panelWeight(item: MediaItem, aspect: AspectKey): number {
  if (item.weight !== null) return clamp(item.weight, 0.15, 8)
  return panelAspect(item, aspect)
}

export interface RowFit {
  /** Shared picture height for every panel in the row, in CSS pixels. */
  mediaHeight: number
  /** Integer panel widths, in CSS pixels, in item order. */
  widths: number[]
}

/**
 * Justify a row of panels so their pictures sit edge to edge.
 *
 * Every panel gets the same picture height H, and a width of `H * weight`. The
 * row therefore needs `H * sum(weights)` of width, so H is whichever is smaller:
 * the height actually available, or the height that makes the row exactly fill
 * the width. Any leftover space ends up *outside* the row, never between the
 * panels.
 *
 * Widths are handed back as integers derived from cumulative positions, so
 * adjacent panels share an exact pixel boundary and no sub-pixel seam can show
 * the background through between two pictures.
 */
export function fitRow(weights: readonly number[], box: Size, footerHeight = 0): RowFit {
  const zero: RowFit = { mediaHeight: 0, widths: weights.map(() => 0) }
  if (weights.length === 0) return { mediaHeight: 0, widths: [] }

  let sum = 0
  for (const weight of weights) sum += weight > 0 ? weight : 0
  const available = box.height - Math.max(0, footerHeight)
  if (sum <= 0 || box.width <= 0 || available <= 0) return zero

  const mediaHeight = Math.floor(Math.min(available, box.width / sum))
  if (mediaHeight <= 0) return zero

  const widths: number[] = []
  let cumulative = 0
  let placed = 0
  for (const weight of weights) {
    cumulative += mediaHeight * Math.max(0, weight)
    const edge = Math.round(cumulative)
    widths.push(edge - placed)
    placed = edge
  }
  return { mediaHeight, widths }
}

/**
 * Resizing a splitter moves weight from one neighbour to the other, keeping
 * their combined width fixed so the rest of the row never jumps.
 */
export function resizePair(
  leftWeight: number,
  rightWeight: number,
  deltaFraction: number,
): [number, number] {
  const total = leftWeight + rightWeight
  if (total <= 0) return [leftWeight, rightWeight]
  const minimum = total * 0.08
  const left = clamp(leftWeight + deltaFraction * total, minimum, total - minimum)
  return [left, total - left]
}
