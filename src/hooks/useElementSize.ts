import { useEffect, useRef, useState } from 'react'
import type { Size } from '../types'

/**
 * Observe an element's box. Updates are coalesced into a rAF so a splitter
 * drag cannot fire a React render per observer callback.
 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T>, Size] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof ResizeObserver === 'undefined') {
      const rect = element.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
      return
    }

    let frame = 0
    let pending: Size | null = null

    const flush = () => {
      frame = 0
      if (!pending) return
      const next = pending
      pending = null
      setSize((previous) =>
        Math.abs(previous.width - next.width) < 0.5 && Math.abs(previous.height - next.height) < 0.5
          ? previous
          : next,
      )
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.contentRect
      pending = { width: box.width, height: box.height }
      if (frame === 0) frame = requestAnimationFrame(flush)
    })

    observer.observe(element)
    const rect = element.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return [ref, size]
}
