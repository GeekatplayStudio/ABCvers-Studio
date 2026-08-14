import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  __resetIdCounter,
  __resetPrimeQueue,
  aspectOf,
  createId,
  intakeFiles,
  loadDngPreview,
  loadExr,
  median,
  primeFps,
  probeFps,
} from './media'
import { MAX_PANELS } from './guards'
import type { MediaItem } from '../types'

const FIXTURES = path.join(__dirname, 'fixtures')
function fixtureBuffer(name: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(FIXTURES, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

/** Stub global fetch for one call, resolving with the given bytes - jsdom does not wire blob: URLs to fetch. */
function mockFetchOnce(buffer: ArrayBuffer) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    arrayBuffer: () => Promise.resolve(buffer),
  } as Response)
}

function fakeFile(name: string, type = 'video/mp4', size = 2048): File {
  return { name, type, size, lastModified: 1_700_000_000_000 } as File
}

const createUrl = (file: File) => `blob:${file.name}`

beforeEach(() => {
  __resetIdCounter()
  __resetPrimeQueue()
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
      imageDecoder: null,
      exposure: 0,
      url: 'blob:a.mp4',
    })
    expect(accepted[1]!.kind).toBe('image')
    expect(accepted[1]!.imageDecoder).toBe('native')
  })

  it('routes EXR and DNG stills to their own decoders, distinct from an ordinary image', () => {
    const { accepted, rejected } = intakeFiles(
      [fakeFile('beauty.exr', ''), fakeFile('IMG_0142.dng', ''), fakeFile('plate.png', 'image/png')],
      { createUrl },
    )
    expect(rejected).toHaveLength(0)
    expect(accepted.map((item) => [item.name, item.kind, item.imageDecoder])).toEqual([
      ['beauty.exr', 'image', 'exr'],
      ['IMG_0142.dng', 'image', 'dng'],
      ['plate.png', 'image', 'native'],
    ])
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
    imageDecoder: null,
    exposure: 0,
    renderTime: '',
  }

  it('uses the intrinsic size', () => {
    expect(aspectOf(base)).toBeCloseTo(16 / 9)
  })

  it('falls back while metadata is still loading', () => {
    expect(aspectOf({ ...base, meta: null })).toBeCloseTo(16 / 9)
    expect(aspectOf({ ...base, meta: { width: 0, height: 0, duration: 0, fps: 0 } }, 1)).toBe(1)
  })
})

/**
 * Minimal stand-in for HTMLVideoElement's requestVideoFrameCallback surface.
 * `fire` simulates a browser presenting a frame at the given media time and
 * re-captures whatever callback the code under test re-registered with, so a
 * test can drive an arbitrary sequence of "frames" one call at a time.
 */
function fakeRvfcVideo(overrides: Record<string, unknown> = {}) {
  let latest: ((now: number, meta: { mediaTime: number }) => void) | null = null
  let handleSeq = 0
  const video = {
    currentTime: 0,
    playbackRate: 1,
    muted: false,
    duration: 10,
    paused: true,
    play: vi.fn(function (this: typeof video) {
      this.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(function (this: typeof video) {
      this.paused = true
    }),
    requestVideoFrameCallback: vi.fn((cb: (now: number, meta: { mediaTime: number }) => void) => {
      latest = cb
      return ++handleSeq
    }),
    cancelVideoFrameCallback: vi.fn(),
    ...overrides,
  }
  return {
    video: video as unknown as HTMLVideoElement,
    fire: (mediaTime: number) => {
      const cb = latest
      latest = null
      cb?.(0, { mediaTime })
    },
  }
}

describe('probeFps', () => {
  it('resolves the default immediately when the browser has no frame callback API', async () => {
    const video = { duration: 10 } as unknown as HTMLVideoElement // no requestVideoFrameCallback
    await expect(probeFps(video)).resolves.toBe(30)
  })

  it('measures fps from the median gap between presented frames', async () => {
    const { video, fire } = fakeRvfcVideo()
    const promise = probeFps(video, 4)
    for (let i = 0; i <= 4; i++) fire(i / 30)
    await expect(promise).resolves.toBe(30)
  })

  it('falls back to the default when the clip never presents a second frame', async () => {
    vi.useFakeTimers()
    try {
      const { video, fire } = fakeRvfcVideo()
      const promise = probeFps(video, 4, 2000)
      fire(0) // one frame only - no gap can be computed from it
      await vi.advanceTimersByTimeAsync(2100)
      await expect(promise).resolves.toBe(30)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('primeFps', () => {
  it('never touches playback when the browser has no frame callback API', async () => {
    const play = vi.fn()
    const video = { duration: 10, play } as unknown as HTMLVideoElement
    await expect(primeFps(video)).resolves.toBe(30)
    expect(play).not.toHaveBeenCalled()
  })

  it('primes a brief muted playback, at normal speed, to measure a paused clip truthfully', async () => {
    const { video, fire } = fakeRvfcVideo({ currentTime: 2.5, playbackRate: 1, muted: false })
    const promise = primeFps(video, { samples: 3 })

    // let `await video.play()` settle before the probe registers its callback
    await Promise.resolve()
    await Promise.resolve()
    expect((video as unknown as { muted: boolean }).muted).toBe(true)
    // normal speed, deliberately: see the comment on primeFps for why a sped-up
    // probe is a correctness bug waiting to happen, not just a nice-to-have
    expect((video as unknown as { playbackRate: number }).playbackRate).toBe(1)

    for (let i = 0; i <= 3; i++) fire(i / 25)

    await expect(promise).resolves.toBe(25)
    const v = video as unknown as {
      play: ReturnType<typeof vi.fn>
      pause: ReturnType<typeof vi.fn>
      currentTime: number
      playbackRate: number
      muted: boolean
    }
    expect(v.play).toHaveBeenCalledTimes(1)
    expect(v.pause).toHaveBeenCalledTimes(1)
    // exactly where it was before priming - a silent measurement, not a seek
    expect(v.currentTime).toBe(2.5)
    expect(v.playbackRate).toBe(1)
    expect(v.muted).toBe(false)
  })

  it('falls back to a passive probe when autoplay is refused, and still restores state', async () => {
    vi.useFakeTimers()
    try {
      const { video } = fakeRvfcVideo({
        muted: false,
        playbackRate: 1,
        play: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
      })
      const promise = primeFps(video, { samples: 4 })
      await vi.advanceTimersByTimeAsync(2100)
      await expect(promise).resolves.toBe(30)
      const v = video as unknown as { muted: boolean; playbackRate: number }
      expect(v.muted).toBe(false)
      expect(v.playbackRate).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds the priming probe well under the passive one, so the flash stays brief', async () => {
    const { video, fire } = fakeRvfcVideo()
    const promise = primeFps(video, { samples: 2, timeoutMs: 100 })
    await Promise.resolve()
    await Promise.resolve()
    fire(0)
    fire(1 / 60) // one gap is not enough to satisfy samples=2, so this times out
    await expect(promise).resolves.toBe(60)
  })

  it('never primes two clips at once, so neither corrupts the other by fighting for the decoder', async () => {
    // Confirmed against real footage: four real 24fps clips added together,
    // each priming concurrently and racing the others for the decoder, came
    // back as 12/12/18/18fps - frames silently dropped under the contention,
    // read back as a confident, wrong, fraction of the true rate. Queuing one
    // clip at a time is what prevents that.
    const events: string[] = []
    const a = fakeRvfcVideo({
      play: vi.fn(() => {
        events.push('a:play')
        return Promise.resolve()
      }),
      pause: vi.fn(() => events.push('a:pause')),
    })
    const b = fakeRvfcVideo({
      play: vi.fn(() => {
        events.push('b:play')
        return Promise.resolve()
      }),
      pause: vi.fn(() => events.push('b:pause')),
    })

    const pa = primeFps(a.video, { samples: 2 })
    const pb = primeFps(b.video, { samples: 2 })

    // Give both queued entries a chance to reach their `await video.play()` -
    // only the head of the queue should actually have started.
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['a:play'])

    a.fire(0)
    a.fire(1 / 24)
    a.fire(2 / 24)
    await pa

    // Only once `a` has fully finished - including its pause - may `b` start.
    // `b:play` resolves before `b`'s requestVideoFrameCallback is registered,
    // so give that its own microtask tick before firing frames at it.
    await Promise.resolve()
    expect(events).toEqual(['a:play', 'a:pause', 'b:play'])

    b.fire(0)
    b.fire(1 / 24)
    b.fire(2 / 24)
    await pb

    expect(events).toEqual(['a:play', 'a:pause', 'b:play', 'b:pause'])
  })
})

describe('loadExr', () => {
  it('fetches a panel URL and decodes it end to end', async () => {
    const fetchSpy = mockFetchOnce(fixtureBuffer('solid-zip16-half.exr'))
    const decoded = await loadExr('blob:whatever')
    expect(fetchSpy).toHaveBeenCalledWith('blob:whatever')
    expect(decoded.width).toBe(16)
    expect(decoded.height).toBe(8)
    fetchSpy.mockRestore()
  })

  it('propagates a decode failure as a rejected promise, not a swallowed error', async () => {
    const fetchSpy = mockFetchOnce(new ArrayBuffer(4)) // too small to be a real EXR
    await expect(loadExr('blob:bad')).rejects.toThrow(/too small/)
    fetchSpy.mockRestore()
  })
})

describe('loadDngPreview', () => {
  it('fetches a panel URL, extracts the embedded preview, and returns a fresh object URL for it', async () => {
    const fetchSpy = mockFetchOnce(fixtureBuffer('chained-ifds.dng'))
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')
    const result = await loadDngPreview('blob:whatever')
    expect(fetchSpy).toHaveBeenCalledWith('blob:whatever')
    expect(result.previewUrl).toBe('blob:preview-1')
    expect(result.previewWidth).toBe(96) // the larger of the two chained IFDs
    expect(result.previewHeight).toBe(64)
    fetchSpy.mockRestore()
    createUrlSpy.mockRestore()
  })

  it('propagates a "no preview" failure as a rejected promise', async () => {
    const fetchSpy = mockFetchOnce(fixtureBuffer('no-preview.dng'))
    await expect(loadDngPreview('blob:bad')).rejects.toThrow(/no embedded JPEG preview/)
    fetchSpy.mockRestore()
  })
})
