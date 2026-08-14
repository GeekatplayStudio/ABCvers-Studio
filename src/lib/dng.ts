/**
 * DNG preview extraction.
 *
 * DNG (and every RAW format built on it) stores sensor data that needs a real
 * demosaic/white-balance/colour pipeline to turn into a picture - reproducing
 * that in the browser is a different, much larger project than a comparison
 * tool (agreed scope; see the README). What *is* practical, and what this
 * does: DNG is TIFF underneath, and virtually every real-world DNG already
 * carries one or more full-quality embedded JPEG previews for exactly this
 * purpose - fast display without decoding the RAW data. This walks the TIFF
 * IFD structure to find the largest one and hands back the byte range of a
 * plain, ordinary JPEG that any browser can already decode - no image
 * decoding happens in this file at all.
 */

import { GuardError } from './guards'

export interface DngPreview {
  /** Byte offset/length of an embedded, browser-decodable JPEG. */
  previewOffset: number
  previewLength: number
  previewWidth: number
  previewHeight: number
  /** The true sensor capture size, from whichever IFD reports the largest image - may exceed the preview's own resolution. */
  sensorWidth: number
  sensorHeight: number
}

const TAG_IMAGE_WIDTH = 0x0100
const TAG_IMAGE_LENGTH = 0x0101
const TAG_COMPRESSION = 0x0103
const TAG_STRIP_OFFSETS = 0x0111
const TAG_STRIP_BYTE_COUNTS = 0x0117
const TAG_SUB_IFDS = 0x014a
const TAG_JPEG_INTERCHANGE_FORMAT = 0x0201
const TAG_JPEG_INTERCHANGE_FORMAT_LENGTH = 0x0202

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
}

function fail(message: string): never {
  throw new GuardError(`DNG: ${message}`)
}

interface Entry {
  tag: number
  type: number
  count: number
  valueOffset: number // the raw 4-byte field - either the value itself or an offset, depending on size
}

class Reader {
  readonly view: DataView
  readonly little: boolean

  constructor(buffer: ArrayBuffer, little: boolean) {
    this.view = new DataView(buffer)
    this.little = little
  }

  u16(offset: number): number {
    return this.view.getUint16(offset, this.little)
  }

  u32(offset: number): number {
    return this.view.getUint32(offset, this.little)
  }
}

/** Reads one IFD's entries. `at` is the file offset of the entry count field. */
function readIfdEntries(reader: Reader, at: number): { entries: (Entry & { fieldOffset: number })[]; nextIfd: number } {
  const count = reader.u16(at)
  const entries: (Entry & { fieldOffset: number })[] = []
  for (let i = 0; i < count; i++) {
    const entryAt = at + 2 + i * 12
    entries.push({
      tag: reader.u16(entryAt),
      type: reader.u16(entryAt + 2),
      count: reader.u32(entryAt + 4),
      fieldOffset: entryAt + 8,
      valueOffset: reader.u32(entryAt + 8),
    })
  }
  const nextIfd = reader.u32(at + 2 + count * 12)
  return { entries, nextIfd }
}

function valueOf(reader: Reader, entry: Entry & { fieldOffset: number }): number {
  const size = TYPE_SIZES[entry.type] ?? 1
  const at = size * entry.count <= 4 ? entry.fieldOffset : entry.valueOffset
  switch (entry.type) {
    case 3: // SHORT
      return reader.u16(at)
    case 4: // LONG
      return reader.u32(at)
    case 1:
    case 6:
    case 7: // BYTE / SBYTE / UNDEFINED
      return reader.view.getUint8(at)
    default:
      return reader.u32(at)
  }
}

interface Candidate {
  width: number
  height: number
  jpegOffset: number
  jpegLength: number
}

function looksLikeJpeg(reader: Reader, offset: number): boolean {
  return (
    offset >= 0 &&
    offset + 1 < reader.view.byteLength &&
    reader.view.getUint8(offset) === 0xff &&
    reader.view.getUint8(offset + 1) === 0xd8
  )
}

/** Finds and returns the largest embedded JPEG preview in a DNG/TIFF file, plus the true sensor size. */
export function findDngPreview(buffer: ArrayBuffer): DngPreview {
  if (buffer.byteLength < 8) fail('file is too small to be a valid TIFF/DNG')
  const marker = new DataView(buffer).getUint16(0, false)
  let little: boolean
  if (marker === 0x4949) little = true
  else if (marker === 0x4d4d) little = false
  else fail('not a TIFF-based file (bad byte-order marker)')

  const reader = new Reader(buffer, little)
  if (reader.u16(2) !== 42) fail('not a valid TIFF/DNG (bad magic number)')
  const firstIfd = reader.u32(4)

  let bestPreview: Candidate | null = null
  let sensorWidth = 0
  let sensorHeight = 0

  const visited = new Set<number>()
  const queue: number[] = [firstIfd]
  const MAX_IFDS = 48 // real DNGs have a handful; this only guards against a corrupt/adversarial cycle

  while (queue.length > 0 && visited.size < MAX_IFDS) {
    const ifdOffset = queue.shift()!
    if (ifdOffset <= 0 || ifdOffset >= buffer.byteLength || visited.has(ifdOffset)) continue
    visited.add(ifdOffset)

    let parsed: ReturnType<typeof readIfdEntries>
    try {
      parsed = readIfdEntries(reader, ifdOffset)
    } catch {
      continue // a malformed IFD - skip it rather than fail the whole file
    }

    const byTag = new Map(parsed.entries.map((e) => [e.tag, e]))
    const width = byTag.has(TAG_IMAGE_WIDTH) ? valueOf(reader, byTag.get(TAG_IMAGE_WIDTH)!) : 0
    const height = byTag.has(TAG_IMAGE_LENGTH) ? valueOf(reader, byTag.get(TAG_IMAGE_LENGTH)!) : 0
    if (width * height > sensorWidth * sensorHeight) {
      sensorWidth = width
      sensorHeight = height
    }

    const compression = byTag.has(TAG_COMPRESSION) ? valueOf(reader, byTag.get(TAG_COMPRESSION)!) : 0
    if (compression === 6 || compression === 7) {
      const [offsetTag, lengthTag] = byTag.has(TAG_JPEG_INTERCHANGE_FORMAT)
        ? [TAG_JPEG_INTERCHANGE_FORMAT, TAG_JPEG_INTERCHANGE_FORMAT_LENGTH]
        : [TAG_STRIP_OFFSETS, TAG_STRIP_BYTE_COUNTS]
      const offsetEntry = byTag.get(offsetTag)
      const lengthEntry = byTag.get(lengthTag)
      if (offsetEntry && lengthEntry) {
        const jpegOffset = valueOf(reader, offsetEntry)
        const jpegLength = valueOf(reader, lengthEntry)
        if (looksLikeJpeg(reader, jpegOffset) && width > 0 && height > 0) {
          const candidate: Candidate = { width, height, jpegOffset, jpegLength }
          if (!bestPreview || candidate.width * candidate.height > bestPreview.width * bestPreview.height) {
            bestPreview = candidate
          }
        }
      }
    }

    if (parsed.nextIfd) queue.push(parsed.nextIfd)
    const subIfds = byTag.get(TAG_SUB_IFDS)
    if (subIfds) {
      const size = TYPE_SIZES[subIfds.type] ?? 4
      const arrayAt = size * subIfds.count <= 4 ? subIfds.fieldOffset : subIfds.valueOffset
      for (let i = 0; i < subIfds.count; i++) queue.push(reader.u32(arrayAt + i * 4))
    }
  }

  if (!bestPreview) {
    fail('no embedded JPEG preview found - full RAW decoding is not supported')
  }

  return {
    previewOffset: bestPreview.jpegOffset,
    previewLength: bestPreview.jpegLength,
    previewWidth: bestPreview.width,
    previewHeight: bestPreview.height,
    sensorWidth: sensorWidth || bestPreview.width,
    sensorHeight: sensorHeight || bestPreview.height,
  }
}
