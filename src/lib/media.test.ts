import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIdCounter, aspectOf, createId, intakeFiles, median } from './media'
import { MAX_PANELS } from './guards'
import type { MediaItem } from '../types'

function fakeFile(name: string, type = 'video/mp4', size = 2048): File {
  return { name, type, size, lastModified: 1_700_000_000_000 } as File
}

const createUrl = (file: File) => `blob:${file.name}`

beforeEach(() => {
  __resetIdCounter()
})

describe('createId', () => {
  it('never repeats', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId()))
    expect(ids.size).toBe(500)
  })
})

describe('intakeFiles', () => {
  it('builds items for every supported file', () => {
    const { accepted, rejected } = intakeFiles(
      [fakeFile('a.mp4'), fakeFile('b.png', 'image/png')],
      { createUrl },
    )
    expect(rejected).toHaveLength(0)
    expect(accepted).toHaveLength(2)
    expect(accepted[0]).toMatchObject({
      name: 'a.mp4',
      kind: 'video',
      status: 'loading',
      volume: 1,
      muted: false,
      weight: null,
      url: 'blob:a.mp4',
    })
    expect(accepted[1]!.kind).toBe('image')
  })

  it('reports unsupported files instead of throwing', () => {
    const { accepted, rejected } = intakeFiles([fakeFile('notes.pdf', 'application/pdf')], {
      createUrl,
    })
    expect(accepted).toHaveLength(0)
    expect(rejected[0]).toMatchObject({ name: 'notes.pdf' })
  })

  it('enforces the panel limit, counting panels already open', () => {
    const files = Array.from({ length: 5 }, (_, i) => fakeFile(`clip${i}.mp4`))
    const { accepted, rejected } = intakeFiles(files, { existing: MAX_PANELS - 2, createUrl })
    expect(accepted).toHaveLength(2)
    expect(rejected).toHaveLength(3)
    expect(rejected[0]!.reason).toContain('limit')
  })

  it('rejects a file whose object URL cannot be created', () => {
    const { accepted, rejected } = intakeFiles([fakeFile('a.mp4')], {
      createUrl: () => {
        throw new Error('nope')
      },
    })
    expect(accepted).toHaveLength(0)
    expect(rejected[0]!.reason).toBe('Could not open file')
  })

  it('handles an empty batch', () => {
    expect(intakeFiles([], { createUrl })).toEqual({ accepted: [], rejected: [] })
  })
})

describe('median', () => {
  it('snaps onto broadcast frame rates', () => {
    expect(median([23.98, 23.97, 23.99])).toBe(23.976)
    expect(median([29.9, 30.1, 30.0])).toBe(30)
    expect(median([59.9, 59.94, 59.95])).toBe(59.94)
  })

  it('shrugs off a dropped frame', () => {
    expect(median([25, 25, 25, 0.5, 25])).toBe(25)
  })

  it('returns an exotic rate unchanged', () => {
    expect(median([17.333, 17.333, 17.333])).toBeCloseTo(17.33)
  })

  it('handles an empty sample', () => {
    expect(median([])).toBe(0)
  })
})

describe('aspectOf', () => {
  const base: MediaItem = {
    id: 'x',
    name: 'x.mp4',
    size: 1,
    mimeType: 'video/mp4',
    lastModified: 0,
    kind: 'video',
    url: 'blob:x',
    status: 'ready',
    meta: { width: 1920, height: 1080, duration: 5, fps: 25 },
    volume: 1,
    muted: false,
    weight: null,
  }

  it('uses the intrinsic size', () => {
    expect(aspectOf(base)).toBeCloseTo(16 / 9)
  })

  it('falls back while metadata is still loading', () => {
    expect(aspectOf({ ...base, meta: null })).toBeCloseTo(16 / 9)
    expect(aspectOf({ ...base, meta: { width: 0, height: 0, duration: 0, fps: 0 } }, 1)).toBe(1)
  })
})
