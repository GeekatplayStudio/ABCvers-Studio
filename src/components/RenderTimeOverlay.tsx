import { useCallback } from 'react'

export interface RenderTimeOverlayProps {
  value: string
  onChange: (value: string) => void
  label: string
}

/**
 * A large, editable black-box overlay at the bottom of a panel's picture, for
 * hand-entering how long that render took - nothing about a video file says
 * that, so this is purely a note the user types in.
 *
 * Lives inside MediaSurface's interactive layer (the same one that drives
 * marquee-zoom and pan), so every pointer event that lands on the input has
 * to be stopped here or it also starts a marquee drag or pans the zoomed
 * image underneath it.
 */
export function RenderTimeOverlay({ value, onChange, label }: RenderTimeOverlayProps) {
  const stop = useCallback((event: React.SyntheticEvent) => event.stopPropagation(), [])

  return (
    <div className="panel__rendertime" onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onWheel={stop}>
      <span className="panel__rendertime-label">Render time</span>
      <input
        type="text"
        className="panel__rendertime-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type render time…"
        aria-label={`Render time for ${label}`}
        data-testid="render-time-input"
      />
    </div>
  )
}
