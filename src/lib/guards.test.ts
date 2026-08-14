import { describe, expect, it } from 'vitest'
import {
  classifyFile,
  clamp,
  extensionOf,
  GuardError,
  invariant,
  MAX_FILE_BYTES,
  safeFps,
  safeTime,
  safeVolume,
} from './guards'

const file = (name: string, type = '', size = 1024) => ({ name, type, size })

describe('classifyFile', () => {
  it('trusts the MIME type first', () => {
    expect(classifyFile(file('clip.bin', 'video/mp4'))).toEqual({ ok: true, kind: 'video' })
    expect(classifyFile(file('shot.bin', 'image/png'))).toEqual({ ok: true, kind: 'image' })
  })

  it('falls back to the extension when the OS gave no MIME type', () => {
    expect(classifyFile(file('render.mkv'))).toEqual({ ok: true, kind: 'video' })
    expect(classifyFile(file('plate.EXR.tiff'))).toEqual({ ok: true, kind: 'image' })
  })

  it('rejects unknown, empty and oversized files with a reason', () => {
    expect(classifyFile(file('notes.txt'))).toMatchObject({ ok: false })
    expect(classifyFile(file('clip.mp4', 'video/mp4', 0))).toMatchObject({ ok: false })
    const huge = classifyFile(file('clip.mp4', 'video/mp4', MAX_FILE_BYTES + 1))
    expect(huge).toMatchObject({ ok: false })
    if (!huge.ok) expect(huge.reason).toContain('larger than')
  })
})

describe('extensionOf', () => {
  it('lowercases and handles edge cases', () => {
    expect(extensionOf('A.MOV')).toBe('mov')
    expect(extensionOf('no-extension')).toBe('')
    expect(extensionOf('trailing.')).toBe('')
    expect(extensionOf('a.b.c.webm')).toBe('webm')
  })
})

describe('numeric guards', () => {
  it('clamps and survives NaN', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(Number.NaN, 2, 3)).toBe(2)
  })

  it('keeps volume inside 0..1', () => {
    expect(safeVolume(2)).toBe(1)
    expect(safeVolume(-1)).toBe(0)
    expect(safeVolume(Number.POSITIVE_INFINITY)).toBe(0)
    expect(safeVolume(0.42)).toBeCloseTo(0.42)
  })

  it('keeps time inside the clip', () => {
    expect(safeTime(12, 10)).toBe(10)
    expect(safeTime(-3, 10)).toBe(0)
    expect(safeTime(Number.NaN, 10)).toBe(0)
    expect(safeTime(4, Number.NaN)).toBe(4)
    expect(safeTime(4)).toBe(4)
  })

  it('discards impossible frame rates', () => {
    expect(safeFps(0)).toBe(0)
    expect(safeFps(-24)).toBe(0)
    expect(safeFps(100000)).toBe(480)
    expect(safeFps(23.976)).toBeCloseTo(23.976)
  })
})

describe('invariant', () => {
  it('throws a GuardError on a falsy condition', () => {
    expect(() => invariant(false, 'boom')).toThrow(GuardError)
    expect(() => invariant(1, 'fine')).not.toThrow()
  })
})
