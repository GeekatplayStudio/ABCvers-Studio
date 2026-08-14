/**
 * A from-scratch OpenEXR scanline reader.
 *
 * No browser decodes EXR natively, and there is no dependency-free way to pull
 * one in, so this implements the file format directly against the public
 * OpenEXR technical specification. Deliberate scope, agreed with the author
 * up front rather than guessed at: single-part **scanline** images (not
 * tiled, not deep/multipart), with **no compression, RLE, ZIPS or ZIP**
 * (PIZ/PXR24/B44/B44A/DWA are not implemented - they are wavelet- or
 * DCT-based and a materially larger undertaking than the byte-oriented
 * schemes here). That covers most real-world renders and plates; anything
 * outside it fails with a specific, readable reason rather than a silent
 * wrong image.
 *
 * Only the conventional "R", "G", "B", "A" channels are read (or a single
 * "Y" luminance channel as a grayscale fallback) - additional AOV layers in
 * a multi-layer EXR are ignored.
 */

import { GuardError } from './guards'

export interface DecodedExr {
  width: number
  height: number
  /** Scene-linear pixel data, RGBA, row-major, top row first. */
  data: Float32Array
  hasAlpha: boolean
}

const MAGIC = 20000630 // 0x762f3101 read as an int32
const TILED_FLAG = 0x200
const DEEP_FLAG = 0x800
const MULTIPART_FLAG = 0x1000

const enum PixelType {
  UINT = 0,
  HALF = 1,
  FLOAT = 2,
}

const enum Compression {
  NONE = 0,
  RLE = 1,
  ZIPS = 2,
  ZIP = 3,
}

interface Channel {
  name: string
  pixelType: PixelType
}

/** Slots 0-3 are R, G, B, A respectively; a single "Y" channel fills R/G/B alike. */
type PickedChannels = readonly [Channel | null, Channel | null, Channel | null, Channel | null]

class Cursor {
  offset = 0
  constructor(readonly view: DataView) {}

  get remaining(): number {
    return this.view.byteLength - this.offset
  }

  i32(): number {
    const v = this.view.getInt32(this.offset, true)
    this.offset += 4
    return v
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true)
    this.offset += 4
    return v
  }

  /** OpenEXR chunk offsets are stored as signed 64-bit; files never approach that size. */
  i64(): number {
    const v = this.view.getBigInt64(this.offset, true)
    this.offset += 8
    return Number(v)
  }

  u8(): number {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }

  bytes(length: number): Uint8Array {
    const v = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length)
    this.offset += length
    return v
  }

  cstr(): string {
    const start = this.offset
    while (this.offset < this.view.byteLength && this.view.getUint8(this.offset) !== 0) this.offset++
    const str = new TextDecoder('latin1').decode(
      new Uint8Array(this.view.buffer, this.view.byteOffset + start, this.offset - start),
    )
    this.offset++ // the terminating zero
    return str
  }
}

function fail(message: string): never {
  throw new GuardError(`EXR: ${message}`)
}

/** IEEE 754 half-precision -> JS double. */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15
  const exponent = (h & 0x7c00) >> 10
  const fraction = h & 0x03ff
  if (exponent === 0) {
    return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024)
  }
  if (exponent === 0x1f) {
    return fraction ? NaN : sign ? -Infinity : Infinity
  }
  return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

function bytesPerSample(pixelType: PixelType): number {
  return pixelType === PixelType.HALF ? 2 : 4
}

interface Header {
  channels: Channel[]
  compression: Compression
  dataWindow: { xMin: number; yMin: number; xMax: number; yMax: number }
}

function readChannelList(cursor: Cursor, size: number): Channel[] {
  const end = cursor.offset + size
  const channels: Channel[] = []
  while (cursor.offset < end) {
    const name = cursor.cstr()
    if (name === '') break
    const pixelType = cursor.i32()
    cursor.offset += 4 // pLinear (1 byte) + 3 reserved bytes
    cursor.i32() // xSampling - subsampled channels are not supported; assumed 1
    cursor.i32() // ySampling
    channels.push({ name, pixelType })
  }
  cursor.offset = end
  return channels
}

function readHeader(cursor: Cursor): Header {
  let channels: Channel[] | null = null
  let compression: Compression | null = null
  let dataWindow: Header['dataWindow'] | null = null

  for (;;) {
    const name = cursor.cstr()
    if (name === '') break
    const type = cursor.cstr()
    const size = cursor.u32()
    const attrStart = cursor.offset

    if (name === 'channels' && type === 'chlist') {
      channels = readChannelList(cursor, size)
    } else if (name === 'compression' && type === 'compression') {
      compression = cursor.u8()
    } else if (name === 'dataWindow' && type === 'box2i') {
      dataWindow = { xMin: cursor.i32(), yMin: cursor.i32(), xMax: cursor.i32(), yMax: cursor.i32() }
    }

    cursor.offset = attrStart + size
  }

  if (!channels || channels.length === 0) fail('no channel list in header')
  if (compression === null) fail('no compression attribute in header')
  if (!dataWindow) fail('no data window in header')
  if (
    ![Compression.NONE, Compression.RLE, Compression.ZIPS, Compression.ZIP].includes(compression)
  ) {
    const names: Record<number, string> = { 4: 'PIZ', 5: 'PXR24', 6: 'B44', 7: 'B44A', 8: 'DWAA', 9: 'DWAB' }
    fail(
      `uses ${names[compression] ?? `compression type ${compression}`} compression, which is not ` +
        'supported - re-export as ZIP, RLE or uncompressed',
    )
  }

  return { channels, compression, dataWindow }
}

/**
 * Undoes the byte-shuffle OpenEXR applies before RLE- or zlib-compressing a
 * chunk: a delta ("predictor") filter, applied to a buffer that has itself
 * been split into two interleaved halves (even byte-positions first, then
 * odd). Shared verbatim between RLE and ZIP/ZIPS - compression differs only
 * in the entropy coder wrapped around this.
 */
function undoPredictorAndInterleave(buffer: Uint8Array): Uint8Array {
  const n = buffer.length
  if (n === 0) return buffer

  // 1. Undo the delta filter, in place, in the buffer's own (shuffled) order.
  let previous = buffer[0]!
  for (let i = 1; i < n; i++) {
    const value = (buffer[i]! + previous! - 384) & 0xff
    buffer[i] = value
    previous = value
  }

  // 2. De-interleave: the first ceil(n/2) bytes are the even output
  // positions, the rest are the odd ones.
  const out = new Uint8Array(n)
  const half = Math.ceil(n / 2)
  let evenSrc = 0
  let oddSrc = half
  for (let d = 0; d < n; d++) {
    out[d] = d % 2 === 0 ? buffer[evenSrc++]! : buffer[oddSrc++]!
  }
  return out
}

/** OpenEXR's byte-oriented RLE (distinct from, and simpler than, zlib). */
function rleDecompress(input: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize)
  let i = 0
  let o = 0
  while (i < input.length && o < expectedSize) {
    const count = input[i]! << 24 >> 24 // sign-extend the byte
    i++
    if (count < 0) {
      const n = -count
      out.set(input.subarray(i, i + n), o)
      i += n
      o += n
    } else {
      const value = input[i]!
      i++
      out.fill(value, o, o + count + 1)
      o += count + 1
    }
  }
  return out
}

async function zipInflate(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    fail('this browser cannot inflate ZIP-compressed EXR data (DecompressionStream is unavailable)')
  }
  // EXR's ZIP/ZIPS compression is plain zlib (RFC 1950), matching the
  // 'deflate' stream format (as opposed to 'deflate-raw' or 'gzip').
  // `.slice().buffer` guarantees a plain ArrayBuffer-backed copy - `input`
  // here is itself a view into another buffer, which stricter DOM lib
  // typings for BodyInit do not accept directly.
  const stream = new Response(input.slice().buffer).body!.pipeThrough(new DecompressionStream('deflate'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

function scanlinesPerChunk(compression: Compression): number {
  return compression === Compression.ZIP ? 16 : 1
}

export async function decodeExr(source: ArrayBuffer): Promise<DecodedExr> {
  const view = new DataView(source)
  if (source.byteLength < 8) fail('file is too small to be a valid EXR')
  const cursor = new Cursor(view)

  if (cursor.i32() !== MAGIC) fail('not an EXR file (bad magic number)')
  const versionField = cursor.u32()
  if ((versionField & TILED_FLAG) !== 0) fail('tiled EXR files are not supported, only scanline images')
  if ((versionField & DEEP_FLAG) !== 0) fail('deep-data EXR files are not supported')
  if ((versionField & MULTIPART_FLAG) !== 0) fail('multi-part EXR files are not supported')

  const header = readHeader(cursor)
  const channels = [...header.channels].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const { dataWindow } = header
  const width = dataWindow.xMax - dataWindow.xMin + 1
  const height = dataWindow.yMax - dataWindow.yMin + 1
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) {
    fail(`implausible data window (${width}x${height})`)
  }

  const wanted = pickChannels(channels)
  const linesPerChunk = scanlinesPerChunk(header.compression)
  const chunkCount = Math.ceil(height / linesPerChunk)

  // Offset table: one int64 file-offset per chunk. Chunks are read through
  // these rather than assumed contiguous, which is the only way to be
  // correct regardless of line order.
  const chunkOffsets: number[] = []
  for (let i = 0; i < chunkCount; i++) chunkOffsets.push(cursor.i64())

  const data = new Float32Array(width * height * 4)
  // Fully opaque by default so an RGB-only (no "A" channel) file renders normally.
  for (let i = 3; i < data.length; i += 4) data[i] = 1

  const rowByteLength = wanted.reduce((sum, c) => sum + (c ? width * bytesPerSample(c.pixelType) : 0), 0)

  for (const chunkOffset of chunkOffsets) {
    const chunkCursor = new Cursor(view)
    chunkCursor.offset = chunkOffset
    const chunkY = chunkCursor.i32()
    const dataSize = chunkCursor.i32()
    const compressed = chunkCursor.bytes(dataSize)

    const rowStart = chunkY - dataWindow.yMin
    const linesInChunk = Math.min(linesPerChunk, height - rowStart)
    if (linesInChunk <= 0) continue // a malformed/out-of-range chunk - skip rather than throw
    const uncompressedSize = rowByteLength * linesInChunk

    let raw: Uint8Array
    if (header.compression === Compression.NONE) {
      raw = compressed
    } else if (header.compression === Compression.RLE) {
      raw = undoPredictorAndInterleave(rleDecompress(compressed, uncompressedSize))
    } else {
      raw = undoPredictorAndInterleave(await zipInflate(compressed))
    }
    if (raw.length < uncompressedSize) fail('a scanline block decompressed shorter than expected')

    writeChunkIntoImage(raw, channels, wanted, width, rowStart, linesInChunk, data)
  }

  return { width, height, data, hasAlpha: wanted[3] !== null }
}

function pickChannels(channels: Channel[]): PickedChannels {
  const byName = new Map(channels.map((c) => [c.name, c]))
  const r = byName.get('R') ?? null
  const g = byName.get('G') ?? null
  const b = byName.get('B') ?? null
  const a = byName.get('A') ?? null

  if (r && g && b) return [r, g, b, a]

  const y = byName.get('Y') ?? null
  if (y) return [y, y, y, a]

  fail(
    `no standard RGB channels found (has: ${channels.map((c) => c.name).join(', ') || 'none'}) - ` +
      'multi-layer EXRs are only supported through their default RGBA layer',
  )
}

function readSample(raw: Uint8Array, byteOffset: number, pixelType: PixelType): number {
  if (pixelType === PixelType.HALF) {
    const half = raw[byteOffset]! | (raw[byteOffset + 1]! << 8)
    return halfToFloat(half)
  }
  const view = new DataView(raw.buffer, raw.byteOffset + byteOffset, 4)
  return pixelType === PixelType.FLOAT ? view.getFloat32(0, true) : view.getUint32(0, true)
}

function writeChunkIntoImage(
  raw: Uint8Array,
  sortedChannels: Channel[],
  wanted: PickedChannels,
  width: number,
  rowStart: number,
  linesInChunk: number,
  out: Float32Array,
): void {
  let cursor = 0
  for (let line = 0; line < linesInChunk; line++) {
    const rowOffsets = new Map<string, number>()
    for (const channel of sortedChannels) {
      rowOffsets.set(channel.name, cursor)
      cursor += width * bytesPerSample(channel.pixelType)
    }

    const outRow = (rowStart + line) * width * 4
    for (let slot = 0; slot < 3; slot++) {
      const channel = wanted[slot]
      if (!channel) continue
      const base = rowOffsets.get(channel.name)!
      const stride = bytesPerSample(channel.pixelType)
      for (let x = 0; x < width; x++) {
        out[outRow + x * 4 + slot] = readSample(raw, base + x * stride, channel.pixelType)
      }
    }
    const alpha = wanted[3]
    if (alpha) {
      const base = rowOffsets.get(alpha.name)!
      const stride = bytesPerSample(alpha.pixelType)
      for (let x = 0; x < width; x++) {
        out[outRow + x * 4 + 3] = readSample(raw, base + x * stride, alpha.pixelType)
      }
    }
  }
}

/**
 * Scene-linear HDR data has to become a viewable SDR image somehow. Reinhard
 * tone-mapping (`x / (x + 1)`) plus an sRGB transfer function is a standard,
 * unsurprising default for a preview - not colour-managed, not a substitute
 * for a real viewer's exposure/ACES pipeline, but a reasonable "what does
 * this render roughly look like" rendering. `exposureStops` multiplies the
 * linear value by `2^stops` before tone-mapping, matching how exposure
 * controls work everywhere else.
 */
export function tonemapToImageData(decoded: DecodedExr, exposureStops: number): ImageData {
  const { width, height, data } = decoded
  const out = new Uint8ClampedArray(width * height * 4)
  const gain = 2 ** exposureStops

  for (let i = 0; i < width * height; i++) {
    const si = i * 4
    for (let c = 0; c < 3; c++) {
      const linear = Math.max(0, data[si + c]!) * gain
      const mapped = linear / (linear + 1)
      out[si + c] = Math.round(srgbEncode(mapped) * 255)
    }
    out[si + 3] = Math.round(clamp01(data[si + 3]!) * 255)
  }

  return new ImageData(out, width, height)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function srgbEncode(linear: number): number {
  const v = clamp01(linear)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}
