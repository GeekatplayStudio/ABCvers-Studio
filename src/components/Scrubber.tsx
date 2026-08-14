import { useCallback, useEffect, useRef } from 'react'
import { clamp } from '../lib/guards'
import { formatClock } from '../lib/format'

export interface ScrubberProps {
  duration: number
  /** Register a setter the parent calls from the rAF loop. Avoids re-renders. */
  bind?: (setTime: (time: number) => void) => () => void
  onSeek: (time: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  label: string
  compact?: boolean
  disabled?: boolean
  /** Static time for the non-animated (test / image) case. */
  time?: number
}

/**
 * Pointer-driven scrubber. The fill and knob are moved by writing CSS custom
 * properties on a ref, never through React state, so dragging one scrubber
 * does not re-render the panel grid.
 */
export function Scrubber({
  duration,
  bind,
  onSeek,
  onScrubStart,
  onScrubEnd,
  label,
  compact = false,
  disabled = false,
  time,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const scrubbing = useRef(false)
  const latest = useRef(0)

  const paint = useCallback(
    (value: number) => {
      latest.current = value
      const track = trackRef.current
      if (!track) return
      const fraction = duration > 0 ? clamp(value / duration, 0, 1) : 0
      track.style.setProperty('--progress', `${(fraction * 100).toFixed(3)}%`)
      const readout = readoutRef.current
      if (readout) readout.textContent = formatClock(value)
    },
    [duration],
  )

  useEffect(() => {
    if (bind) return bind(paint)
    paint(time ?? 0)
    return undefined
  }, [bind, paint, time])

  const timeFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track || duration <= 0) return 0
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return 0
      return clamp((clientX - rect.left) / rect.width, 0, 1) * duration
    },
    [duration],
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || duration <= 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      scrubbing.current = true
      onScrubStart?.()
      const next = timeFromEvent(event.clientX)
      paint(next)
      onSeek(next)
    },
    [disabled, duration, onScrubStart, onSeek, paint, timeFromEvent],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing.current) return
      const next = timeFromEvent(event.clientX)
      paint(next)
      onSeek(next)
    },
    [onSeek, paint, timeFromEvent],
  )

  const endScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing.current) return
      scrubbing.current = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onScrubEnd?.()
    },
    [onScrubEnd],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || duration <= 0) return
      const nudge = event.shiftKey ? 1 : 0.1
      let next: number | null = null
      if (event.key === 'ArrowLeft') next = latest.current - nudge
      else if (event.key === 'ArrowRight') next = latest.current + nudge
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = duration
      if (next === null) return
      event.preventDefault()
      const clamped = clamp(next, 0, duration)
      paint(clamped)
      onSeek(clamped)
    },
    [disabled, duration, onSeek, paint],
  )

  return (
    <div className={`scrubber${compact ? ' scrubber--compact' : ''}`} data-disabled={disabled || duration <= 0}>
      <div
        ref={trackRef}
        className="scrubber__track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, duration)}
        aria-valuenow={latest.current}
        aria-valuetext={formatClock(latest.current)}
        aria-disabled={disabled || duration <= 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={onKeyDown}
      >
        <div className="scrubber__fill" />
        <div className="scrubber__knob" />
      </div>
      {!compact && (
        <div className="scrubber__times">
          <span ref={readoutRef} className="scrubber__time">
            {formatClock(0)}
          </span>
          <span className="scrubber__time scrubber__time--muted">{formatClock(duration)}</span>
        </div>
      )}
    </div>
  )
}
