import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CaretIcon } from './Icons'

export interface DropdownOption<T> {
  value: T
  /** What the row, and the closed trigger, say. */
  label: string
  /** Secondary text on the right of the row - a consequence, not a second name. */
  hint?: string
  title?: string
  /** Show the trigger's label dimmed while this option is the chosen one. */
  dim?: boolean
}

export interface DropdownProps<T> {
  /** Accessible name for the trigger, e.g. "Aspect ratio". */
  label: string
  value: T
  options: readonly DropdownOption<T>[]
  onChange: (value: T) => void
  title?: string
  disabled?: boolean
  /** Trigger width, so it does not resize as the chosen label changes. */
  width?: number
  testId?: string
}

/**
 * The app's own dropdown, rather than a native `<select>`.
 *
 * A `select` draws its own control and its own option sheet from the OS, which
 * in a near-black toolbar reads as a piece of some other application. This
 * keeps the toolbar's button styling for the closed control and the pen
 * picker's popover styling for the open list, so a collapsed control looks the
 * same as the buttons it replaced.
 *
 * The list is portaled to `document.body` and positioned from the trigger's
 * screen coordinates for the same reason the pen picker is: the toolbar scrolls
 * horizontally on narrow windows, and `overflow-x: auto` forces `overflow-y`
 * with it, which would clip a menu hanging below the bar.
 */
export function Dropdown<T extends string | number>({
  label,
  value,
  options,
  onChange,
  title,
  disabled = false,
  width,
  testId,
}: DropdownProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const selected = options[selectedIndex]

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  const commit = useCallback(
    (next: T) => {
      onChange(next)
      close()
    },
    [onChange, close],
  )

  return (
    <div className="dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="btn dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={title}
        disabled={disabled}
        data-dim={selected?.dim || undefined}
        style={width ? { minWidth: `${width}px` } : undefined}
        data-testid={testId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="dropdown__label">{selected?.label ?? ''}</span>
        <CaretIcon size={13} className="dropdown__caret" />
      </button>
      {open && (
        <DropdownMenu
          label={label}
          anchorRef={triggerRef}
          options={options}
          selectedIndex={selectedIndex}
          onCommit={commit}
          onClose={close}
        />
      )}
    </div>
  )
}

interface DropdownMenuProps<T> {
  label: string
  anchorRef: React.RefObject<HTMLElement>
  options: readonly DropdownOption<T>[]
  selectedIndex: number
  onCommit: (value: T) => void
  onClose: (refocus?: boolean) => void
}

function DropdownMenu<T extends string | number>({
  label,
  anchorRef,
  options,
  selectedIndex,
  onCommit,
  onClose,
}: DropdownMenuProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [active, setActive] = useState(selectedIndex)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({ top: rect.bottom + 5, left: rect.left })
  }, [anchorRef])

  // Opening with the keyboard has to move focus into the list, or the arrow
  // keys would still be talking to the trigger behind it.
  useEffect(() => {
    rootRef.current?.focus()
  }, [position])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose(false)
    }
    // Anchored by screen coordinates, so it goes stale the moment anything
    // scrolls or resizes - closing beats chasing the anchor every frame.
    const onViewportChange = () => onClose(false)
    // Next tick: the click that opened this menu is itself a pointerdown that
    // would otherwise close it again immediately.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('scroll', onViewportChange, true)
      window.addEventListener('resize', onViewportChange)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [onClose])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => Math.min(last, index + 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setActive((index) => Math.max(0, index - 1))
        return
      case 'Home':
        event.preventDefault()
        setActive(0)
        return
      case 'End':
        event.preventDefault()
        setActive(last)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (options[active]) onCommit(options[active]!.value)
        return
      case 'Escape':
      case 'Tab':
        event.preventDefault()
        onClose()
    }
  }

  if (!position) return null

  const optionId = (index: number) => `dropdown-option-${index}`

  return createPortal(
    <div
      ref={rootRef}
      className="dropdown__menu"
      role="listbox"
      tabIndex={-1}
      aria-label={label}
      aria-activedescendant={optionId(active)}
      style={{ top: position.top, left: position.left }}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          id={optionId(index)}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          tabIndex={-1}
          className="dropdown__option"
          title={option.title}
          data-active={index === active || undefined}
          onPointerEnter={() => setActive(index)}
          onClick={() => onCommit(option.value)}
        >
          <span>{option.label}</span>
          {option.hint && <span className="dropdown__hint">{option.hint}</span>}
        </button>
      ))}
    </div>,
    document.body,
  )
}
