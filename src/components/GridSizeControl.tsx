import { useCallback, useRef } from 'react'
import { clamp } from '../lib/guards'

export interface GridSizeControlProps {
  /** Screens per row the stage is actually laying out. */
  columns: number
  /** How many panels are open. */
  count: number
  /** Fewest columns - largest panels - whose rows still span the stage. */
  fitColumns: number
  onColumns: (columns: number) => void
}

/**
 * How big the panels in a grid are.
 *
 * This is a size control, not a shape picker: drag right and the panels get
 * bigger, which means fewer of them fit on a line and the grid reflows to suit.
 * Column counts are the mechanism, never the interface - nobody comparing two
 * renders wants to think in `4 x 3`.
 *
 * Position 0 is every panel on one line, the smallest they ever are. The right
 * end is `fitColumns`, the largest they get while every row still spans the
 * stage - and it is an end rather than a midpoint because panel size is *not*
 * monotonic in column count. Past that point each row runs out of height
 * before it runs out of width, so the pictures shrink to fit the height and
 * leave black bars down both sides: fewer columns, smaller panels *and* less
 * of the stage covered. There is nothing over there worth reaching, so the
 * track stops, and every position on it fills the width.
 */
export function GridSizeControl({ columns, count, fitColumns, onColumns }: GridSizeControlProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const largest = clamp(Math.round(fitColumns), 1, Math.max(1, count))
  const steps = Math.max(1, count - largest)
  const disabled = count < 2 || count - largest < 1
  const index = clamp(count - clamp(Math.round(columns), 1, count), 0, steps)

  const commit = useCallback(
    (nextIndex: number) => {
      onColumns(count - clamp(Math.round(nextIndex), 0, steps))
    },
    [count, onColumns, steps],
  )

  const indexFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track) return index
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return index
      return ((clientX - rect.left) / rect.width) * steps
    },
    [index, steps],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    commit(indexFromEvent(event.clientX))
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    commit(indexFromEvent(event.clientX))
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      commit(index - 1)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      commit(index + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      commit(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      commit(steps)
    }
  }

  const position = `${((index / steps) * 100).toFixed(2)}%`

  return (
    <div className="gridsize">
      {/* Two squares, small then large, in place of any number: the whole
          point of this control is that it is not a count. */}
      <span className="gridsize__end gridsize__end--sm" aria-hidden="true" />
      <div
        ref={trackRef}
        className="gridsize__track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Panel size"
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={index}
        aria-valuetext={columns === 1 ? 'One screen per row' : `${columns} screens per row`}
        aria-disabled={disabled}
        title="How big the panels are - larger panels mean fewer of them on a line"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        style={{ '--knob': position } as React.CSSProperties}
      >
        <div className="gridsize__fill" />
        <div className="gridsize__knob" />
      </div>
      <span className="gridsize__end gridsize__end--lg" aria-hidden="true" />
    </div>
  )
}
