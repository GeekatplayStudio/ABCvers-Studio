/**
 * Panel layout maths.
 *
 * Panels live in flex rows. In `free` aspect mode each panel's default weight
 * is its own aspect ratio, so a row of mixed 16:9 and 9:16 clips shares one
 * height with zero letterboxing and zero gaps between screens. Locked aspect
 * modes give every panel the same weight instead.
 */

import { clamp } from './guards'
import type { AspectKey, LayoutMode, MediaItem, Size } from '../types'
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

/**
 * In `row` layout every panel stays on a single line, however many there are -
 * a comparison is between all of them at once, and wrapping into a grid
 * behind the user's back once a fifth or sixth panel is added means the panels
 * they are actively comparing are no longer side by side on screen together.
 * `fitRow` still shrinks panels to fit, so more panels means narrower ones,
 * never a second row.
 *
 * `grid` is the opt-in escape hatch for when that trade stops paying: a row of
 * eight clips is so narrow that each picture is a sliver, and squaring them off
 * gives every panel back most of its height.
 */
export function autoColumns(count: number, layout: LayoutMode = 'row'): number {
  if (count <= 0) return 1
  if (layout === 'grid') return Math.ceil(Math.sqrt(count))
  return count
}

export function resolveColumns(
  count: number,
  columns: number | 'auto',
  layout: LayoutMode = 'row',
): number {
  if (count <= 0) return 1
  if (columns === 'auto') return autoColumns(count, layout)
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
/**
 * However tall the footer measures, never let it claim more than this share
 * of the row. Without a cap, a footer that grows because the panel is
 * narrow (the info strip's grid running out of columns and stacking its
 * fields, for instance) shrinks the picture, which narrows the panel
 * further, which grows the footer again - an unbounded collapse down to a
 * sliver. The cap turns that into a bounded, one-time degradation instead:
 * the picture stays at least half the row no matter what the footer wants.
 */
const MAX_FOOTER_SHARE = 0.5

export function fitRow(weights: readonly number[], box: Size, footerHeight = 0): RowFit {
  const zero: RowFit = { mediaHeight: 0, widths: weights.map(() => 0) }
  if (weights.length === 0) return { mediaHeight: 0, widths: [] }

  let sum = 0
  for (const weight of weights) sum += weight > 0 ? weight : 0
  const reservedFooter = Math.min(Math.max(0, footerHeight), box.height * MAX_FOOTER_SHARE)
  const available = box.height - reservedFooter
  if (sum <= 0 || box.width <= 0 || available <= 0) return zero

  /*
   * A height-constrained row is floored to a whole pixel; a width-constrained
   * one is not. Flooring the second case would leave `sum` pixels - up to a
   * couple of dozen on a wide grid - of background showing down the side of a
   * row that is supposed to reach both edges. The widths below are integers
   * either way, since they come from rounding cumulative positions rather than
   * from the height directly.
   */
  const widthFit = box.width / sum
  const mediaHeight = available <= widthFit ? Math.floor(available) : widthFit
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
 * Picture height a row of these weights gets when it fills the width exactly.
 * This is the height that leaves nothing black down either side.
 */
function heightToFillWidth(weights: readonly number[], width: number): number {
  let sum = 0
  for (const weight of weights) sum += weight > 0 ? weight : 0
  return sum > 0 ? width / sum : 0
}

/**
 * The fewest columns - and so the largest panels - whose grid still fits the
 * stage with every row spanning the full width.
 *
 * The two things a grid can do wrong are mirror images: too many columns and
 * the panels are needlessly small; too few and each row runs out of height
 * before it runs out of width, so the pictures shrink to fit the height and
 * leave black bars down both sides. Those bars are the whole reason this is
 * measured against the real stage rather than picked from the panel count with
 * something like `ceil(sqrt(n))` - the right number of columns depends on the
 * shape of the window as much as on how many panels are open.
 *
 * A column count fits exactly when the width-filling height is one the row can
 * afford, which is why this can test "does it fill the width" and "does it fit
 * the height" as the same question.
 */
export function bestFitColumns(
  weights: readonly number[],
  box: Size,
  footerHeight = 0,
): number {
  const count = weights.length
  if (count <= 1) return 1
  if (box.width <= 0 || box.height <= 0) return count

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = chunkRows(weights, columns)
    const rowHeight = box.height / rows.length
    const reserved = Math.min(Math.max(0, footerHeight), rowHeight * MAX_FOOTER_SHARE)
    const available = rowHeight - reserved
    if (available <= 0) continue
    // Only full rows are asked to span the stage. A short last row keeps the
    // panel size the rows above set - stretching two panels across the width
    // of four would make them bigger than everything they are being compared
    // against - so what it would need to fill the width is not a constraint.
    const full = rows.filter((row) => row.length === columns)
    const binding = full.length > 0 ? full : rows
    const needed = Math.max(...binding.map((row) => heightToFillWidth(row, box.width)))
    if (needed <= available) return columns
  }
  // Nothing fits (a stage barely taller than the info strips): the smallest
  // panels are the best of a bad set.
  return count
}

/**
 * Every column count the grid slider may offer, largest panels first. Always
 * at least one entry, so the control is never empty.
 */
export function gridColumnChoices(count: number): number[] {
  const total = Math.max(1, count)
  return Array.from({ length: total }, (_, index) => index + 1)
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
