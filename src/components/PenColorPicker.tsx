import { useEffect, useRef } from 'react'
import { PEN_COLORS } from '../lib/draw'

export interface PenColorPickerProps {
  color: string
  onSelect: (color: string) => void
  onClose: () => void
}

/**
 * The palette that opens on a right-click of the pen button. A popover
 * rather than the app's full modal - it should feel like a quick right-click
 * menu, not a dialog you have to formally dismiss.
 */
export function PenColorPicker({ color, onSelect, onClose }: PenColorPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // Capture phase, and next tick: the right-click that opened this popover
    // is itself a pointerdown/contextmenu pair that must not immediately
    // close it again.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div ref={rootRef} className="pen-picker" role="menu" aria-label="Pen colour">
      {PEN_COLORS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={option.value === color}
          aria-label={option.label}
          title={option.label}
          className="pen-picker__swatch"
          data-selected={option.value === color || undefined}
          style={{ '--swatch': option.value } as React.CSSProperties}
          onClick={() => {
            onSelect(option.value)
            onClose()
          }}
        />
      ))}
    </div>
  )
}
