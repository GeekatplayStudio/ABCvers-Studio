import { useCallback, useEffect, useRef, useState } from 'react'

export type HeightRef = (key: string) => (element: HTMLElement | null) => void

/**
 * Tallest height among a set of registered elements.
 *
 * A row has to reserve exactly as much space as its widest info strip needs
 * before it can work out how tall the pictures may be. Strips differ in height
 * (a narrow panel wraps its metadata onto more lines), so the row measures them
 * all and reserves the maximum - anything less and the pictures would be pushed
 * out of alignment by whichever panel happened to be tallest.
 */
export function useMaxHeight(): [HeightRef, number] {
  const [height, setHeight] = useState(0)
  const elements = useRef(new Map<string, HTMLElement>())
  const observer = useRef<ResizeObserver | null>(null)
  const frame = useRef(0)

  const measure = useCallback(() => {
    if (frame.current !== 0 || typeof requestAnimationFrame === 'undefined') return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      let max = 0
      for (const element of elements.current.values()) {
        if (element.offsetHeight > max) max = element.offsetHeight
      }
      setHeight((previous) => (Math.abs(previous - max) < 0.5 ? previous : max))
    })
  }, [])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const instance = new ResizeObserver(measure)
    observer.current = instance
    for (const element of elements.current.values()) instance.observe(element)
    return () => {
      instance.disconnect()
      observer.current = null
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [measure])

  const register = useCallback<HeightRef>(
    (key) => (element) => {
      const map = elements.current
      const previous = map.get(key)
      if (previous && previous !== element) {
        observer.current?.unobserve(previous)
        map.delete(key)
      }
      if (element) {
        map.set(key, element)
        observer.current?.observe(element)
      }
      measure()
    },
    [measure],
  )

  return [register, height]
}
