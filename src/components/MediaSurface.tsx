import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStudio } from '../store/useStudio'
import { useElementSize } from '../hooks/useElementSize'
import {
  composeZoom,
  contentBox,
  isFullRect,
  panRect,
  rectToTransform,
  transformToCss,
  viewToContent,
  zoomRectBy,
} from '../lib/zoom'
import { clamp } from '../lib/guards'
import type { Point } from '../types'

interface MediaSurfaceProps {
  /** Intrinsic aspect ratio of the media (width / height). */
  aspect: number
  children: ReactNode
  /** Rendered above the picture but below the marquee, e.g. a spinner. */
  overlay?: ReactNode
}

/**
 * The picture area of a panel.
 *
 * Owns three things: the letterboxed content box, the synchronized zoom
 * transform, and the marquee / pan interaction. The zoom rect it reads and
 * writes is global, which is exactly why zooming in one panel magnifies the
 * same region in every other panel at the same instant.
 */
export function MediaSurface({ aspect, children, overlay }: MediaSurfaceProps) {
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>()
  const zoom = useStudio((state) => state.zoom)
  const zoomMode = useStudio((state) => state.zoomMode)
  const fitMode = useStudio((state) => state.fitMode)
  const setZoom = useStudio((state) => state.setZoom)

  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null)
  const dragStart = useRef<Point | null>(null)
  const panLast = useRef<Point | null>(null)

  // Fit letterboxes inside the panel; fill crops so the picture reaches every
  // edge. With the justified row layout the two are identical for an untouched
  // panel - they only diverge once a splitter drag or an aspect lock makes the
  // panel a different shape from its media.
  const box = useMemo(
    () => (fitMode === 'fill' ? viewport : contentBox(viewport, aspect)),
    [fitMode, viewport, aspect],
  )
  const transform = useMemo(() => rectToTransform(zoom, box), [zoom, box])
  const zoomed = !isFullRect(zoom)

  const localPoint = useCallback((event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const point = localPoint(event)
      event.currentTarget.setPointerCapture(event.pointerId)
      if (zoomMode) {
        dragStart.current = point
        setMarquee({ a: point, b: point })
      } else if (zoomed) {
        panLast.current = point
      }
    },
    [localPoint, zoomMode, zoomed],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const point = localPoint(event)
      if (dragStart.current) {
        setMarquee({ a: dragStart.current, b: point })
        return
      }
      if (panLast.current) {
        const dx = point.x - panLast.current.x
        const dy = point.y - panLast.current.y
        panLast.current = point
        if (zoom) setZoom(panRect(zoom, dx, dy, box))
      }
    },
    [box, localPoint, setZoom, zoom],
  )

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      const start = dragStart.current
      dragStart.current = null
      panLast.current = null
      setMarquee(null)
      if (!start) return
      const next = composeZoom(start, localPoint(event), box, zoom)
      if (next) setZoom(next)
    },
    [box, localPoint, setZoom, zoom],
  )

  /** ctrl/cmd + wheel magnifies around the cursor, like every NLE viewer. */
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const content = viewToContent(point, box, transform)
      const base = zoom ?? { x: 0, y: 0, w: 1, h: 1 }
      const focus = {
        x: clamp((content.x - base.x) / base.w, 0, 1),
        y: clamp((content.y - base.y) / base.h, 0, 1),
      }
      const factor = Math.exp(-event.deltaY * 0.0016)
      setZoom(zoomRectBy(base, factor, focus))
    },
    [box, setZoom, transform, zoom],
  )

  const marqueeStyle = marquee
    ? {
        left: Math.min(marquee.a.x, marquee.b.x),
        top: Math.min(marquee.a.y, marquee.b.y),
        width: Math.abs(marquee.b.x - marquee.a.x),
        height: Math.abs(marquee.b.y - marquee.a.y),
      }
    : null

  return (
    <div className="surface" ref={viewportRef} data-fit={fitMode}>
      <div
        className="surface__content"
        data-mode={zoomMode ? 'marquee' : zoomed ? 'pan' : 'idle'}
        style={{ width: box.width || undefined, height: box.height || undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <div
          className="surface__zoom"
          style={{ transform: transformToCss(transform), willChange: zoomed ? 'transform' : undefined }}
        >
          {children}
        </div>
        {overlay}
        {marqueeStyle && <div className="surface__marquee" style={marqueeStyle} />}
      </div>
    </div>
  )
}
