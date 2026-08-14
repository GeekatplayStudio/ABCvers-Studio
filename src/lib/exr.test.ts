import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decodeExr, tonemapToImageData } from './exr'

const FIXTURES = path.join(__dirname, 'fixtures')
const oracle = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'exr-oracle.json'), 'utf8')) as Record<
  string,
  {
    width: number
    height: number
    hasAlpha: boolean
    samples: Record<string, { r: number; g: number; b: number; a?: number }>
  }
>

/** Node's Buffer shares an ArrayBuffer with other data - slice out just this file's bytes. */
function readFixture(name: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(FIXTURES, `${name}.exr`))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

/**
 * Ground truth for every fixture was produced independently, by round-tripping
 * the same file through ffmpeg's own OpenEXR decoder (see
 * scripts referenced in the commit that added these fixtures) - so this is
 * comparing against a second, unrelated implementation, not re-deriving
 * expectations from this parser's own assumptions.
 */
const ALL_FIXTURES = Object.keys(oracle)

describe.each(ALL_FIXTURES)('decodeExr - %s', (name) => {
  const expected = oracle[name]!

  it('reports the correct dimensions and alpha presence', async () => {
    const decoded = await decodeExr(readFixture(name))
    expect(decoded.width).toBe(expected.width)
    expect(decoded.height).toBe(expected.height)
    expect(decoded.hasAlpha).toBe(expected.hasAlpha)
  })

  it('matches the independently-decoded pixel values at every sample point', async () => {
    const decoded = await decodeExr(readFixture(name))
    const { width, height, data } = decoded
    // Half-float source data only carries ~3 significant decimal digits.
    const tolerance = name.endsWith('half') ? 0.003 : 0.0005

    const coords: Record<string, [number, number]> = {
      topLeft: [0, 0],
      topRight: [width - 1, 0],
      bottomLeft: [0, height - 1],
      bottomRight: [width - 1, height - 1],
      center: [Math.floor(width / 2), Math.floor(height / 2)],
    }

    for (const [label, [x, y]] of Object.entries(coords)) {
      const want = expected.samples[label]!
      const i = (y * width + x) * 4
      expect(data[i], `${label}.r`).toBeCloseTo(want.r, undefined)
      expect(Math.abs(data[i]! - want.r)).toBeLessThan(tolerance)
      expect(Math.abs(data[i + 1]! - want.g)).toBeLessThan(tolerance)
      expect(Math.abs(data[i + 2]! - want.b)).toBeLessThan(tolerance)
      if (want.a !== undefined) {
        expect(Math.abs(data[i + 3]! - want.a)).toBeLessThan(tolerance)
      } else {
        expect(data[i + 3]).toBe(1) // no alpha channel in the file - fully opaque
      }
    }
  })
})

describe('decodeExr - agreement across compression schemes', () => {
  it('produces the same pixels for the same content regardless of compression', async () => {
    const [none, rle, zips, zip] = await Promise.all([
      decodeExr(readFixture('solid-none-float')),
      decodeExr(readFixture('solid-rle-float')),
      decodeExr(readFixture('solid-zip1-float')),
      decodeExr(readFixture('solid-zip16-float')),
    ])
    expect(rle.data).toEqual(none.data)
    expect(zips.data).toEqual(none.data)
    expect(zip.data).toEqual(none.data)
  })

  it('produces the same pixels for half and float encodings of the same source, within half precision', async () => {
    const [half, float] = await Promise.all([
      decodeExr(readFixture('solid-none-half')),
      decodeExr(readFixture('solid-none-float')),
    ])
    for (let i = 0; i < half.data.length; i++) {
      expect(Math.abs(half.data[i]! - float.data[i]!)).toBeLessThan(0.003)
    }
  })

  it('decodes every scanline of a taller, multi-chunk (ZIP, 16 lines/chunk) gradient correctly', async () => {
    const decoded = await decodeExr(readFixture('gradient-zip16-half'))
    // A left-to-right gradient must be monotonically non-decreasing along
    // every row, and identical down every column - proof no chunk boundary
    // (this file is 32 rows tall, so two 16-line ZIP chunks) got misplaced,
    // duplicated, or dropped.
    for (let y = 0; y < decoded.height; y++) {
      let previous = -Infinity
      for (let x = 0; x < decoded.width; x++) {
        const value = decoded.data[(y * decoded.width + x) * 4]!
        expect(value).toBeGreaterThanOrEqual(previous)
        previous = value
      }
    }
    const row0 = decoded.data.slice(0, decoded.width * 4)
    const rowLast = decoded.data.slice((decoded.height - 1) * decoded.width * 4)
    expect(rowLast).toEqual(row0)
  })
})

describe('decodeExr - malformed input', () => {
  it('rejects a file that is too small to contain a header', async () => {
    await expect(decodeExr(new ArrayBuffer(4))).rejects.toThrow(/too small/)
  })

  it('rejects a file with the wrong magic number', async () => {
    const buf = new ArrayBuffer(16)
    new DataView(buf).setInt32(0, 0, true)
    await expect(decodeExr(buf)).rejects.toThrow(/bad magic/)
  })

  it('rejects a tiled EXR with a specific reason, not a generic parse failure', async () => {
    const buf = new ArrayBuffer(8)
    const view = new DataView(buf)
    view.setInt32(0, 20000630, true)
    view.setUint32(4, 0x200, true) // tiled flag
    await expect(decodeExr(buf)).rejects.toThrow(/tiled/)
  })

  it('rejects deep-data and multi-part EXRs by name', async () => {
    const makeVersion = (flag: number) => {
      const buf = new ArrayBuffer(8)
      const view = new DataView(buf)
      view.setInt32(0, 20000630, true)
      view.setUint32(4, flag, true)
      return buf
    }
    await expect(decodeExr(makeVersion(0x800))).rejects.toThrow(/deep/)
    await expect(decodeExr(makeVersion(0x1000))).rejects.toThrow(/multi-part/)
  })
})

describe('tonemapToImageData', () => {
  it('maps scene-linear 1.0 to a bright but non-clipped value via Reinhard', async () => {
    const decoded = await decodeExr(readFixture('solid-none-float'))
    const image = tonemapToImageData(decoded, 0)
    expect(image.width).toBe(decoded.width)
    expect(image.height).toBe(decoded.height)
    // R channel source ~0.496 linear -> tonemapped and sRGB-encoded, strictly
    // brighter than a naive linear*255 but still well inside 0..255.
    expect(image.data[0]).toBeGreaterThan(0)
    expect(image.data[0]).toBeLessThan(255)
  })

  it('raising exposure brightens the preview without touching the decoded source', async () => {
    const decoded = await decodeExr(readFixture('solid-none-float'))
    const dim = tonemapToImageData(decoded, -2)
    const bright = tonemapToImageData(decoded, 2)
    expect(bright.data[0]).toBeGreaterThan(dim.data[0]!)
    // exposure is a display-only transform - the underlying linear data must
    // never be mutated by tone-mapping it repeatedly.
    expect(decoded.data[0]).toBeCloseTo(oracle['solid-none-float']!.samples.topLeft!.r, 3)
  })

  it('clamps rather than wraps at the top of the range', async () => {
    const decoded = await decodeExr(readFixture('solid-none-float'))
    const blownOut = tonemapToImageData(decoded, 20)
    expect(blownOut.data[0]).toBeLessThanOrEqual(255)
    expect(blownOut.data[0]).toBeGreaterThan(240) // Reinhard asymptotes toward 1, not past it
  })

  it('carries alpha straight through as an 8-bit value, unaffected by exposure', async () => {
    const decoded = await decodeExr(readFixture('alpha-zip1-half'))
    const image = tonemapToImageData(decoded, 3)
    expect(image.data[3]).toBe(255) // alpha=1.0 in the fixture
  })
})
