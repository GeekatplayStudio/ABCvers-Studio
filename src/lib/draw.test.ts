import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PEN_COLOR,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES,
  MIN_POINT_DISTANCE,
  PEN_COLORS,
  STROKE_WIDTH,
  __resetStrokeCounter,
  createStrokeId,
  distance,
  scalePoints,
  smoothPath,
} from './draw'

describe('PEN_COLORS', () => {
  it('includes every colour asked for by name: black, white, orange, cyan', () => {
    const labels = PEN_COLORS.map((c) => c.label)
    expect(labels).toEqual(expect.arrayContaining(['Black', 'White', 'Orange', 'Cyan']))
  })

  it('offers more than just the four named colours', () => {
    expect(PEN_COLORS.length).toBeGreaterThan(4)
  })

  it('every colour is a valid, distinct hex value', () => {
    const values = PEN_COLORS.map((c) => c.value)
    expect(new Set(values).size).toBe(values.length)
    for (const value of values) expect(value).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('defaults to the app\'s own accent colour, not an arbitrary pick', () => {
    expect(DEFAULT_PEN_COLOR).toBe('#e8813a')
    expect(PEN_COLORS.some((c) => c.value === DEFAULT_PEN_COLOR)).toBe(true)
  })
})

describe('distance', () => {
  it('is a plain 2D Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0)
  })
})

describe('smoothPath', () => {
  it('is empty for no points', () => {
    expect(smoothPath([])).toBe('')
  })

  it('renders a single point as a zero-length line, so a click still paints a dot', () => {
    const path = smoothPath([{ x: 10, y: 20 }])
    expect(path).toBe('M 10 20 L 10 20')
  })

  it('starts at the first point and ends at the last, for a two-point stroke', () => {
    const path = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])
    expect(path.startsWith('M 0 0')).toBe(true)
    expect(path.endsWith('L 10 10')).toBe(true)
  })

  it('uses quadratic curves through the midpoints for three or more points, not straight segments', () => {
    const path = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])
    expect(path).toContain('Q')
    // one Q command per interior point (points.length - 2), plus the closing L
    expect(path.match(/Q/g)?.length).toBe(2)
  })

  it('is deterministic for the same input', () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }]
    expect(smoothPath(points)).toBe(smoothPath(points))
  })
})

describe('scalePoints', () => {
  it('maps normalized 0..1 storage onto the current box in pixels', () => {
    const scaled = scalePoints([{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0.25 }], 200, 100)
    expect(scaled).toEqual([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 25 }])
  })

  it('does not mutate the input', () => {
    const input = [{ x: 0.5, y: 0.5 }]
    scalePoints(input, 100, 100)
    expect(input).toEqual([{ x: 0.5, y: 0.5 }])
  })
})

describe('createStrokeId', () => {
  beforeEach(() => __resetStrokeCounter())

  it('never repeats', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createStrokeId()))
    expect(ids.size).toBe(200)
  })
})

describe('guardrail constants are sane', () => {
  it('are all positive and in a sensible order relative to each other', () => {
    expect(STROKE_WIDTH).toBeGreaterThan(0)
    expect(MAX_POINTS_PER_STROKE).toBeGreaterThan(100)
    expect(MAX_STROKES).toBeGreaterThan(1)
    expect(MIN_POINT_DISTANCE).toBeGreaterThan(0)
    expect(MIN_POINT_DISTANCE).toBeLessThan(0.05) // must not visibly coarsen a stroke
  })
})
