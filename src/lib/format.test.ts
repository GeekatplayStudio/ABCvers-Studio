import { describe, expect, it } from 'vitest'
import {
  aspectLabel,
  formatBytes,
  formatClock,
  formatDuration,
  formatResolution,
  formatTimecode,
  middleTruncate,
} from './format'

describe('formatBytes', () => {
  it('scales through the units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
  })

  it('guards against nonsense', () => {
    expect(formatBytes(-1)).toBe('--')
    expect(formatBytes(Number.NaN)).toBe('--')
  })
})

describe('formatClock', () => {
  it('renders minutes, seconds and milliseconds', () => {
    expect(formatClock(0)).toBe('0:00.000')
    expect(formatClock(62.48)).toBe('1:02.480')
  })

  it('adds an hours field past one hour', () => {
    expect(formatClock(3723.5)).toBe('1:02:03.500')
  })

  it('never renders negatives', () => {
    expect(formatClock(-5)).toBe('0:00.000')
  })
})

describe('formatTimecode', () => {
  it('produces HH:MM:SS:FF at a given rate', () => {
    expect(formatTimecode(0, 25)).toBe('00:00:00:00')
    expect(formatTimecode(1.5, 25)).toBe('00:00:01:12')
    expect(formatTimecode(3661.04, 25)).toBe('01:01:01:01')
  })

  it('never overflows the frame field', () => {
    expect(formatTimecode(0.9999, 25)).toBe('00:00:00:24')
  })

  it('falls back to frame 00 without a rate', () => {
    expect(formatTimecode(9.9, 0)).toBe('00:00:09:00')
  })
})

describe('formatDuration', () => {
  it('switches unit by magnitude', () => {
    expect(formatDuration(12.484)).toBe('12.48s')
    expect(formatDuration(64)).toBe('1m 04s')
    expect(formatDuration(3720)).toBe('1h 02m')
    expect(formatDuration(0)).toBe('--')
  })
})

describe('aspectLabel', () => {
  it('reduces common resolutions', () => {
    expect(aspectLabel(1920, 1080)).toBe('16:9')
    expect(aspectLabel(1080, 1920)).toBe('9:16')
    expect(aspectLabel(1000, 1000)).toBe('1:1')
  })

  it('falls back to a decimal for odd sizes', () => {
    expect(aspectLabel(1279, 719)).toBe('1.78:1')
    expect(aspectLabel(0, 0)).toBe('--')
  })
})

describe('misc formatters', () => {
  it('formats a resolution', () => {
    expect(formatResolution(3840, 2160)).toBe('3840 x 2160')
    expect(formatResolution(0, 0)).toBe('--')
  })

  it('truncates in the middle so the extension survives', () => {
    const long = 'a-very-long-render-name-from-the-farm.mov'
    const short = middleTruncate(long, 20)
    expect(short.length).toBeLessThanOrEqual(20)
    expect(short).toContain('…')
    expect(short.endsWith('.mov')).toBe(true)
    expect(middleTruncate('short.mp4', 20)).toBe('short.mp4')
  })
})
