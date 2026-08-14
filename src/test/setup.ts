import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/* jsdom implements neither media playback nor object URLs. Stub just enough
   that components can mount and the sync engine can drive them. */

if (typeof window !== 'undefined') {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })

  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:test' })
  }
  if (!('revokeObjectURL' in URL)) {
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => undefined })
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }

  /* jsdom ships no PointerEvent at all, so fireEvent.pointerDown would silently
     drop clientX/clientY and every drag test would read position 0. A MouseEvent
     subclass is enough for the properties the app actually uses. */
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends window.MouseEvent {
      readonly pointerId: number
      readonly pointerType: string
      readonly isPrimary: boolean
      readonly width: number
      readonly height: number
      readonly pressure: number

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
        this.pointerType = init.pointerType ?? 'mouse'
        this.isPrimary = init.isPrimary ?? true
        this.width = init.width ?? 1
        this.height = init.height ?? 1
        this.pressure = init.pressure ?? 0.5
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
    globalThis.PointerEvent = window.PointerEvent
  }

  // Pointer capture is unimplemented in jsdom.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function () {}
    Element.prototype.releasePointerCapture = function () {}
    Element.prototype.hasPointerCapture = function () {
      return false
    }
  }

  if (!Element.prototype.requestFullscreen) {
    Element.prototype.requestFullscreen = () => Promise.resolve()
  }
}

afterEach(() => {
  cleanup()
})
