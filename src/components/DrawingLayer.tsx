import { useCallback, useRef, useState } from 'react'
import { useStudio } from '../store/useStudio'
import { useElementSize } from '../hooks/useElementSize'
import { clamp } from '../lib/guards'
import {
  MAX_POINTS_PER_STROKE,
  MIN_POINT_DISTANCE,
  STROKE_WIDTH,
  createStrokeId,
  distance,
  scalePoints,
  smoothPath,
} from '../lib/draw'
import type { Point } from '../types'

/**
 * The pen: one transparent layer sitting above every panel at once, not
 * scoped to any single one of them. That is deliberate - it is what lets a
 * stroke (an arrow, say) start over one panel and end pointing into another,
 * which a per-panel drawing surface could never do. Points are stored as 0..1
 * fractions of this layer's own box, so a window resize or a layout change
 * keeps every annotation roughly where it was drawn instead of pinning it to
 * one particular panel's now-possibly-different pixel geometry.
 *
 * Independent of every panel's own zoom/pan state on purpose: an annotation
 * spanning several panels only makes sense against the same, shared,
 * unzoomed layout all of them are drawn into.
 */
export function DrawingLayer() {
  const [containerRef, box] = useElementSize<HTMLDivElement>()
  const drawMode = useStudio((state) => state.drawMode)
  const drawColor = useStudio((state) => state.drawColor)
  const strokes = useStudio((state) => state.strokes)
  const addStroke = useStudio((state) => state.addStroke)

  // The authoritative in-progress point list lives in a ref, not state - a
  // stroke is only committed to the store from a plain event handler
  // (pointer up), never from inside a setState updater, which React 18
  // StrictMode double-invokes in development and would silently duplicate it.
  const pointsRef = useRef<Point[]>([])
  const isDrawing = useRef(false)
  const [livePoints, setLivePoints] = useState<Point[] | null>(null)

  const toLocalPoint = useCallback((event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = rect.width || 1
    const height = rect.height || 1
    return {
      x: clamp((event.clientX - rect.left) / width, 0, 1),
      y: clamp((event.clientY - rect.top) / height, 0, 1),
    }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drawMode || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      isDrawing.current = true
      const point = toLocalPoint(event)
      pointsRef.current = [point]
      setLivePoints(pointsRef.current)
    },
    [drawMode, toLocalPoint],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing.current) return
      if (pointsRef.current.length >= MAX_POINTS_PER_STROKE) return
      const point = toLocalPoint(event)
      const last = pointsRef.current[pointsRef.current.length - 1]
      if (last && distance(last, point) < MIN_POINT_DISTANCE) return
      pointsRef.current = [...pointsRef.current, point]
      setLivePoints(pointsRef.current)
    },
    [toLocalPoint],
  )

  const finishStroke = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing.current) return
      isDrawing.current = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (pointsRef.current.length > 0) {
        addStroke({ id: createStrokeId(), color: drawColor, points: pointsRef.current })
      }
      pointsRef.current = []
      setLivePoints(null)
    },
    [addStroke, drawColor],
  )

  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // The native menu would otherwise interrupt a drawing session; the
      // pen's colour picker lives on the toolbar button, not on the canvas.
      if (drawMode) event.preventDefault()
    },
    [drawMode],
  )

  const measured = box.width > 0 && box.height > 0

  return (
    <div
      ref={containerRef}
      className="drawing-layer"
      data-active={drawMode || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onContextMenu={onContextMenu}
      role={drawMode ? 'img' : undefined}
      aria-label={drawMode ? 'Drawing canvas - drag to annotate every panel' : undefined}
    >
      {measured && (
        <svg
          className="drawing-layer__svg"
          width={box.width}
          height={box.height}
          viewBox={`0 0 ${box.width} ${box.height}`}
        >
          {strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={smoothPath(scalePoints(stroke.points, box.width, box.height))}
              stroke={stroke.color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="annotation-stroke"
            />
          ))}
          {livePoints && livePoints.length > 0 && (
            <path
              d={smoothPath(scalePoints(livePoints, box.width, box.height))}
              stroke={drawColor}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="annotation-stroke annotation-stroke--live"
              data-testid="live-stroke"
            />
          )}
        </svg>
      )}
    </div>
  )
}
