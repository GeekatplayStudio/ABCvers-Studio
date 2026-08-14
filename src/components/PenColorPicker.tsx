import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PEN_COLORS } from '../lib/draw'

export interface PenColorPickerProps {
  color: string
  anchorRef: React.RefObject<HTMLElement>
  onSelect: (color: string) => void
  onClose: () => void
}

/**
 * The palette that opens on a right-click of the pen button. A popover
 * rather than the app's full modal - it should feel like a quick right-click
 * menu, not a dialog you have to formally dismiss.
 *
 * Portaled to document.body and positioned from the anchor's own screen
 * coordinates, rather than left as a normal absolutely-positioned child of
 * the toolbar: the toolbar scrolls horizontally on narrow windows
 * (overflow-x: auto), which forces overflow-y to auto too, silently
 * clipping anything that would otherwise hang below it - the picker was
 * being cut off at the toolbar's own bottom edge before this.
 */
export function PenColorPicker({ color, anchorRef, onSelect, onClose }: PenColorPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({ top: rect.bottom + 6, left: rect.left })
  }, [anchorRef])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // A popover anchored by screen coordinates goes stale the moment the
    // page scrolls or resizes - closing it is simpler and safer than
    // tracking the anchor and repositioning on every frame.
    const onViewportChange = () => onClose()
    // Capture phase, and next tick: the right-click that opened this popover
    // is itself a pointerdown/contextmenu pair that must not immediately
    // close it again.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown)
      window.addEventListener('scroll', onViewportChange, true)
      window.addEventListener('resize', onViewportChange)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [onClose])

  if (!position) return null

  return createPortal(
    <div
      ref={rootRef}
      className="pen-picker"
      role="menu"
      aria-label="Pen colour"
      style={{ top: position.top, left: position.left }}
    >
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
    </div>,
    document.body,
  )
}
