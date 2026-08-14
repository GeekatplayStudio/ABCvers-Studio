import { describe, expect, it } from 'vitest'
import {
  autoColumns,
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
})

describe('columns', () => {
  it('keeps small sets on one row', () => {
    expect(autoColumns(1)).toBe(1)
    expect(autoColumns(4)).toBe(4)
  })

  it('wraps larger sets into a grid', () => {
    expect(autoColumns(6)).toBe(3)
    expect(autoColumns(12)).toBe(4)
    expect(autoColumns(0)).toBe(1)
  })

  it('never asks for more columns than there are panels', () => {
    expect(resolveColumns(2, 6)).toBe(2)
    expect(resolveColumns(6, 3)).toBe(3)
    expect(resolveColumns(5, 'auto')).toBe(3)
    expect(resolveColumns(0, 4)).toBe(1)
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
