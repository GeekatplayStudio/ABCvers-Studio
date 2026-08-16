import { describe, expect, it } from 'vitest'
import {
  autoColumns,
  bestFitColumns,
  chunkRows,
  fitRow,
  panelAspect,
  panelWeight,
  ratioFor,
  resizePair,
  resolveColumns,
} from './layout'
import type { MediaItem } from '../types'

const item = (width: number, height: number, weight: number | null = null): MediaItem => ({
  id: `${width}x${height}`,
  name: 'clip.mp4',
  size: 1,
  mimeType: 'video/mp4',
  lastModified: 0,
  kind: 'video',
  url: 'blob:x',
  status: 'ready',
  meta: { width, height, duration: 1, fps: 25 },
  volume: 1,
  muted: false,
  weight,
  imageDecoder: null,
  exposure: 0,
  renderTime: '',
})

describe('columns', () => {
  it('keeps every panel in a single row, however many there are', () => {
    // Regression coverage: auto used to wrap once a fifth or sixth panel
    // arrived, which put some of the panels someone is actively comparing
    // on a second row, out of the same at-a-glance view as the rest.
    expect(autoColumns(1)).toBe(1)
    expect(autoColumns(4)).toBe(4)
    expect(autoColumns(5)).toBe(5)
    expect(autoColumns(6)).toBe(6)
    expect(autoColumns(9)).toBe(9)
    expect(autoColumns(12)).toBe(12)
    expect(autoColumns(0)).toBe(1)
  })

  it('squares the panels off in grid layout', () => {
    expect(autoColumns(1, 'grid')).toBe(1)
    expect(autoColumns(2, 'grid')).toBe(2) // 2x1
    expect(autoColumns(4, 'grid')).toBe(2) // 2x2
    expect(autoColumns(5, 'grid')).toBe(3) // 3 + 2
    expect(autoColumns(6, 'grid')).toBe(3) // 3x2
    expect(autoColumns(9, 'grid')).toBe(3) // 3x3
    expect(autoColumns(12, 'grid')).toBe(4) // 4x3
    expect(autoColumns(0, 'grid')).toBe(1)
  })

  it('never asks for more columns than there are panels', () => {
    expect(resolveColumns(2, 6)).toBe(2)
    expect(resolveColumns(6, 3)).toBe(3)
    expect(resolveColumns(5, 'auto')).toBe(5)
    expect(resolveColumns(0, 4)).toBe(1)
  })

  it('follows the layout mode only when the column count is automatic', () => {
    expect(resolveColumns(6, 'auto', 'row')).toBe(6)
    expect(resolveColumns(6, 'auto', 'grid')).toBe(3)
    // An explicit count is the user's own decision - it outranks either mode.
    expect(resolveColumns(6, 2, 'row')).toBe(2)
    expect(resolveColumns(6, 5, 'grid')).toBe(5)
  })
})

describe('bestFitColumns', () => {
  const wide = Array.from({ length: 9 }, () => 16 / 9)

  it('picks the fewest columns whose grid still fills the width', () => {
    // Nine 16:9 panels on a 1280x606 stage. Three across is the squarest
    // arrangement, but it needs 426x240 pictures to fill the width and only
    // 202 of height per row is available - so it would shrink to 359 wide and
    // leave ~200px of black split down both sides. Four across fits exactly.
    expect(bestFitColumns(wide, { width: 1280, height: 606 })).toBe(4)
  })

  it('gives a tall window fewer, larger columns than a short one', () => {
    expect(bestFitColumns(wide, { width: 1280, height: 1400 })).toBe(3)
    expect(bestFitColumns(wide, { width: 1280, height: 300 })).toBe(5)
  })

  it('every column count it returns fills the width rather than the height', () => {
    for (const height of [280, 400, 606, 900, 1400]) {
      const box = { width: 1280, height }
      const columns = bestFitColumns(wide, box)
      const rows = Math.ceil(wide.length / columns)
      const fit = fitRow(wide.slice(0, columns), { width: box.width, height: box.height / rows })
      const rowWidth = fit.widths.reduce((sum, width) => sum + width, 0)
      expect(rowWidth).toBe(box.width) // no black down either side
    }
  })

  it('reserves the info strips before deciding, so they cannot bring the bars back', () => {
    const box = { width: 1280, height: 606 }
    expect(bestFitColumns(wide, box, 0)).toBe(4)
    // Strips eat height, which is exactly what forces smaller, more numerous
    // panels - the alternative is a row that no longer reaches both edges.
    expect(bestFitColumns(wide, box, 60)).toBe(5)
  })

  it('is safe before the stage has been measured, and with one panel', () => {
    expect(bestFitColumns(wide, { width: 0, height: 0 })).toBe(9)
    expect(bestFitColumns([16 / 9], { width: 1280, height: 606 })).toBe(1)
    expect(bestFitColumns([], { width: 1280, height: 606 })).toBe(1)
  })
})

describe('chunkRows', () => {
  it('splits into rows of at most n', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('is safe with a bad column count', () => {
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]])
    expect(chunkRows([], 3)).toEqual([])
  })
})

describe('panelAspect / panelWeight', () => {
  it('follows the media ratio in free mode so rows have no letterboxing', () => {
    expect(panelWeight(item(1920, 1080), 'free')).toBeCloseTo(16 / 9)
    expect(panelWeight(item(1080, 1920), 'free')).toBeCloseTo(9 / 16)
  })

  it('gives every panel the locked shape when the aspect is locked', () => {
    expect(panelAspect(item(1920, 1080), '1:1')).toBe(1)
    expect(panelAspect(item(1080, 1920), '1:1')).toBe(1)
    expect(panelWeight(item(1080, 1920), '16:9')).toBeCloseTo(16 / 9)
  })

  it('respects a width the user dragged', () => {
    expect(panelWeight(item(1920, 1080, 2.5), 'free')).toBe(2.5)
    expect(panelWeight(item(1920, 1080, 2.5), '16:9')).toBe(2.5)
  })

  it('treats a 1 override as a real override, not as "auto"', () => {
    expect(panelWeight(item(1920, 1080, 1), 'free')).toBe(1)
  })

  it('clamps extreme ratios', () => {
    expect(panelWeight(item(10000, 100), 'free')).toBe(4)
    expect(panelWeight(item(100, 10000), 'free')).toBe(0.25)
  })
})

describe('fitRow', () => {
  it('sizes every panel to the same height, width proportional to its shape', () => {
    // 16:9 + 1:1 in a 1000x400 row -> sum of weights 2.777…
    const { mediaHeight, widths } = fitRow([16 / 9, 1], { width: 1000, height: 400 })
    expect(mediaHeight).toBe(360) // width-constrained: 1000 / 2.777…
    expect(widths[0]).toBe(640)
    expect(widths[1]).toBe(360)
  })

  it('leaves no sub-pixel seam: widths are integers that meet exactly', () => {
    const weights = [16 / 9, 4 / 3, 2.39, 0.75]
    const { mediaHeight, widths } = fitRow(weights, { width: 997, height: 500 })
    expect(widths.every((w) => Number.isInteger(w))).toBe(true)
    // Each edge sits where the exact fractional layout would have put it.
    let exact = 0
    let placed = 0
    weights.forEach((weight, index) => {
      exact += mediaHeight * weight
      placed += widths[index]!
      expect(Math.abs(placed - exact)).toBeLessThan(1)
    })
  })

  it('is height-constrained when the row is tall and narrow', () => {
    const { mediaHeight, widths } = fitRow([1, 1], { width: 4000, height: 300 })
    expect(mediaHeight).toBe(300)
    expect(widths).toEqual([300, 300])
  })

  it('reserves room for the info strips before sizing the pictures', () => {
    const bare = fitRow([1], { width: 4000, height: 300 })
    const withStrip = fitRow([1], { width: 4000, height: 300 }, 80)
    expect(bare.mediaHeight).toBe(300)
    expect(withStrip.mediaHeight).toBe(220)
  })

  it('never overflows the row it was given', () => {
    const { widths } = fitRow([2, 2, 2], { width: 500, height: 900 })
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(500)
  })

  it('degrades safely before anything has been measured', () => {
    expect(fitRow([1, 1], { width: 0, height: 0 })).toEqual({ mediaHeight: 0, widths: [0, 0] })
    expect(fitRow([], { width: 100, height: 100 })).toEqual({ mediaHeight: 0, widths: [] })
    expect(fitRow([0, 0], { width: 100, height: 100 })).toEqual({ mediaHeight: 0, widths: [0, 0] })
  })

  describe('footer reservation cap', () => {
    // Regression coverage for a real bug: a narrow panel's info strip can
    // legitimately need more vertical space (its fields wrap onto more
    // rows), and reserving that in full shrinks the picture, which narrows
    // the panel further, which wraps more fields - an unbounded collapse
    // down to a sliver a few tens of pixels wide. Confirmed against five
    // real portrait video panels: they collapsed to ~70px wide before this
    // cap existed.

    it('never lets the footer claim more than half the row, however tall it measures', () => {
      // width kept large so the picture is height- (not width-) constrained,
      // isolating the footer cap's effect.
      const { mediaHeight } = fitRow([1], { width: 4000, height: 400 }, 1000)
      expect(mediaHeight).toBe(200) // half of 400, not "negative and clamped to zero"
    })

    it('leaves the picture at exactly the uncapped size when the footer fits comfortably', () => {
      const capped = fitRow([1], { width: 4000, height: 400 }, 190) // well under 50%
      expect(capped.mediaHeight).toBe(210) // 400 - 190, cap never engages
    })

    it('is a strict function of height, not a runaway: doubling a too-tall footer does not shrink the picture further', () => {
      const a = fitRow([1], { width: 4000, height: 400 }, 500)
      const b = fitRow([1], { width: 4000, height: 400 }, 5000)
      expect(a.mediaHeight).toBe(200)
      expect(b.mediaHeight).toBe(200)
    })

    it('a footer that would consume the entire row still leaves a usable picture rather than collapsing to zero', () => {
      const { mediaHeight, widths } = fitRow([1], { width: 100, height: 40 }, 200)
      expect(mediaHeight).toBe(20) // half of 40, previously this fell to 0
      expect(widths[0]).toBe(20)
    })
  })
})

describe('resizePair', () => {
  it('conserves the pair total', () => {
    const [left, right] = resizePair(1, 1, 0.25)
    expect(left + right).toBeCloseTo(2)
    expect(left).toBeGreaterThan(1)
  })

  it('will not collapse a panel to nothing', () => {
    const [left, right] = resizePair(1, 1, -10)
    expect(left).toBeGreaterThan(0)
    expect(right).toBeLessThan(2)
    expect(left + right).toBeCloseTo(2)
  })

  it('is a no-op on a degenerate pair', () => {
    expect(resizePair(0, 0, 0.5)).toEqual([0, 0])
  })
})

describe('ratioFor', () => {
  it('returns null for free and a number for locks', () => {
    expect(ratioFor('free')).toBeNull()
    expect(ratioFor('16:9')).toBeCloseTo(16 / 9)
    expect(ratioFor('2.39:1')).toBeCloseTo(2.39)
  })
})
