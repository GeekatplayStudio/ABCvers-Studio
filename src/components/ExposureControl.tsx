import { useCallback, useRef } from 'react'
import { clamp } from '../lib/guards'
import { ResetIcon } from './Icons'

export interface ExposureControlProps {
  /** Adjustment in stops; 0 is the file's own scene-linear values, untouched. */
  value: number
  onChange: (stops: number) => void
  label: string
  min?: number
  max?: number
  compact?: boolean
}

/**
 * A bipolar slider for EXR preview exposure. Visually and behaviourally a
 * sibling of VolumeControl, but centred on zero rather than anchored at the
 * left - "no adjustment" is a real, meaningful, and default position here,
 * not an endpoint.
 */
export function ExposureControl({
  value,
  onChange,
  label,
  min = -6,
  max = 6,
  compact = false,
}: ExposureControlProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const valueFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track) return 0
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return 0
      const fraction = clamp((clientX - rect.left) / rect.width, 0, 1)
      // Snap to a friendly 1/4-stop grid - fine control without asking for
      // pixel-perfect precision on a track that is only a few dozen px wide.
      const raw = min + fraction * (max - min)
      return Math.round(raw * 4) / 4
    },
    [min, max],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    onChange(valueFromEvent(event.clientX))
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    onChange(valueFromEvent(event.clientX))
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 1 : 0.25
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(clamp(value - step, min, max))
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(clamp(value + step, min, max))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(0)
    }
  }

  const fraction = clamp((value - min) / (max - min), 0, 1)
  const zeroFraction = clamp((0 - min) / (max - min), 0, 1)
  const barStart = Math.min(fraction, zeroFraction)
  const barEnd = Math.max(fraction, zeroFraction)

  return (
    <div className={`exposure${compact ? ' exposure--compact' : ''}`}>
      <button
        type="button"
        className="iconbtn"
        onClick={() => onChange(0)}
        disabled={value === 0}
        aria-label={`Reset ${label} exposure`}
        title="Reset exposure (Home)"
      >
        <ResetIcon size={compact ? 13 : 15} />
      </button>
      <div
        ref={trackRef}
        className="exposure__track"
        role="slider"
        tabIndex={0}
        aria-label={`${label} exposure`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value > 0 ? '+' : ''}${value} stops`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        style={
          {
            '--zero': `${(zeroFraction * 100).toFixed(2)}%`,
            '--bar-start': `${(barStart * 100).toFixed(2)}%`,
            '--bar-end': `${(barEnd * 100).toFixed(2)}%`,
            '--knob': `${(fraction * 100).toFixed(2)}%`,
          } as React.CSSProperties
        }
      >
        <div className="exposure__zero" />
        <div className="exposure__fill" />
        <div className="exposure__knob" />
      </div>
      <span className="exposure__value">
        {value > 0 ? '+' : ''}
        {value.toFixed(2).replace(/\.?0+$/, '') || '0'} EV
      </span>
    </div>
  )
}
