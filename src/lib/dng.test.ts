import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { findDngPreview } from './dng'

const FIXTURES = path.join(__dirname, 'fixtures')

/**
 * These .dng fixtures are hand-built, structurally-correct TIFF files (not
 * captured from a real camera - no real sample was available here), each
 * containing a real, valid, ffmpeg-produced JPEG as its embedded preview.
 * That keeps the assertions below meaningful: the parser is being checked
 * against known, deliberately-placed byte offsets, not against its own
 * assumptions about what it should find.
 */
function readFixture(name: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(FIXTURES, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function jpegAt(buffer: ArrayBuffer, offset: number, length: number): Uint8Array {
  return new Uint8Array(buffer, offset, length)
}

describe('findDngPreview', () => {
  it('extracts the single embedded JPEG preview from a minimal TIFF', () => {
    const buffer = readFixture('single-ifd.dng')
    const preview = findDngPreview(buffer)
    expect(preview.previewWidth).toBe(32)
    expect(preview.previewHeight).toBe(24)
    expect(preview.sensorWidth).toBe(32) // no larger IFD anywhere in this file
    expect(preview.sensorHeight).toBe(24)

    const jpeg = jpegAt(buffer, preview.previewOffset, preview.previewLength)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8) // JPEG SOI marker
  })

  it('follows the next-IFD chain and prefers the larger of two previews', () => {
    const buffer = readFixture('chained-ifds.dng')
    const preview = findDngPreview(buffer)
    // IFD0 holds a 32x24 thumbnail, IFD1 (chained via the next-IFD pointer)
    // holds a 96x64 preview - the bigger one must win.
    expect(preview.previewWidth).toBe(96)
    expect(preview.previewHeight).toBe(64)

    const jpeg = jpegAt(buffer, preview.previewOffset, preview.previewLength)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
  })

  it('walks SubIFDs, skips non-JPEG candidates, and reports true sensor size separately from the preview', () => {
    const buffer = readFixture('subifd.dng')
    const preview = findDngPreview(buffer)
    // The raw SubIFD (4000x3000, uncompressed) must not be picked as a
    // preview - it has no JPEG data - but its size is the true sensor size.
    expect(preview.sensorWidth).toBe(4000)
    expect(preview.sensorHeight).toBe(3000)
    // The actual preview comes from the *other* SubIFD, which is smaller
    // than the sensor but bigger than IFD0's own thumbnail.
    expect(preview.previewWidth).toBe(96)
    expect(preview.previewHeight).toBe(64)

    const jpeg = jpegAt(buffer, preview.previewOffset, preview.previewLength)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
  })

  it('reads a big-endian ("MM") TIFF exactly like a little-endian one', () => {
    const buffer = readFixture('big-endian.dng')
    const preview = findDngPreview(buffer)
    expect(preview.previewWidth).toBe(32)
    expect(preview.previewHeight).toBe(24)
    const jpeg = jpegAt(buffer, preview.previewOffset, preview.previewLength)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
  })

  it('fails with a specific reason when no embedded JPEG preview exists', () => {
    const buffer = readFixture('no-preview.dng')
    expect(() => findDngPreview(buffer)).toThrow(/no embedded JPEG preview/)
  })

  it('fails with a specific reason on a bad byte-order marker', () => {
    const buffer = new ArrayBuffer(16)
    new DataView(buffer).setUint16(0, 0x1234, false)
    expect(() => findDngPreview(buffer)).toThrow(/byte-order marker/)
  })

  it('fails with a specific reason on a bad TIFF magic number', () => {
    const buffer = new ArrayBuffer(16)
    const view = new DataView(buffer)
    view.setUint16(0, 0x4949, false) // "II"
    view.setUint16(2, 0, true) // should be 42
    expect(() => findDngPreview(buffer)).toThrow(/bad magic number/)
  })

  it('fails cleanly rather than hanging or crashing on a truncated file', () => {
    expect(() => findDngPreview(new ArrayBuffer(4))).toThrow(/too small/)
  })

  it('never mistakes a plausible-looking but wrong offset for a real JPEG', () => {
    // Same shape as single-ifd.dng, but the strip offset has been nudged so
    // it lands one byte off from the real SOI marker - must be rejected, not
    // silently returned as a "preview" that will fail to decode later.
    const good = readFixture('single-ifd.dng')
    const tampered = good.slice(0)
    const view = new DataView(tampered)
    // The StripOffsets entry is the 4th of 5 in IFD0; its inline value sits
    // at a fixed spot for this fixture's known layout (entries start at byte
    // 10, each entry is 12 bytes, the value field is the last 4 of entry 4).
    const stripOffsetsEntryStart = 8 + 2 + 3 * 12
    const valueFieldOffset = stripOffsetsEntryStart + 8
    const original = view.getUint32(valueFieldOffset, true)
    view.setUint32(valueFieldOffset, original + 1, true)
    expect(() => findDngPreview(tampered)).toThrow(/no embedded JPEG preview/)
  })
})
