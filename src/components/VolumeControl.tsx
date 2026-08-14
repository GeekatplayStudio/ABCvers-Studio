import { useCallback, useRef } from 'react'
import { clamp } from '../lib/guards'
import { MuteIcon, VolumeIcon } from './Icons'

export interface VolumeControlProps {
  volume: number
  muted: boolean
  onVolume: (value: number) => void
  onToggleMute: (event: React.MouseEvent) => void
  label: string
  compact?: boolean
  disabled?: boolean
}

export function VolumeControl({
  volume,
  muted,
  onVolume,
  onToggleMute,
  label,
  compact = false,
  disabled = false,
}: VolumeControlProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const valueFromEvent = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return clamp((clientX - rect.left) / rect.width, 0, 1)
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    onVolume(valueFromEvent(event.clientX))
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    onVolume(valueFromEvent(event.clientX))
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const stepSize = event.shiftKey ? 0.2 : 0.05
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onVolume(clamp(volume - stepSize, 0, 1))
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onVolume(clamp(volume + stepSize, 0, 1))
    }
  }

  const shown = muted ? 0 : volume

  return (
    <div className={`volume${compact ? ' volume--compact' : ''}`}>
      <button
        type="button"
        className="iconbtn"
        onClick={onToggleMute}
        disabled={disabled}
        aria-pressed={muted}
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        title={muted ? `Unmute ${label}` : `Mute ${label} (alt+click to solo)`}
      >
        {muted ? <MuteIcon size={compact ? 14 : 16} /> : <VolumeIcon size={compact ? 14 : 16} />}
      </button>
      <div
        ref={trackRef}
        className="volume__track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} volume`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown * 100)}
        aria-valuetext={`${Math.round(shown * 100)} percent`}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        style={{ '--level': `${(shown * 100).toFixed(1)}%` } as React.CSSProperties}
      >
        <div className="volume__fill" />
      </div>
    </div>
  )
}
