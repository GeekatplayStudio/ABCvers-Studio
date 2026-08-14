import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PenColorPicker, type PenColorPickerProps } from './PenColorPicker'
import { PEN_COLORS } from '../lib/draw'

// PenColorPicker needs a real anchor element to position itself against -
// it is portaled to document.body, so rendering it directly (with no
// anchor) would leave it permanently unpositioned (it renders null until
// the anchor ref resolves).
function Anchored(props: Omit<PenColorPickerProps, 'anchorRef'>) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchorRef}>anchor</button>
      <PenColorPicker {...props} anchorRef={anchorRef} />
    </>
  )
}

describe('PenColorPicker', () => {
  it('lists every configured colour as a menu item', () => {
    render(<Anchored color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(PEN_COLORS.length)
  })

  it('marks the current colour as checked', () => {
    render(<Anchored color={PEN_COLORS[2]!.value} onSelect={() => {}} onClose={() => {}} />)
    const checked = screen.getByRole('menuitemradio', { checked: true })
    expect(checked).toHaveAttribute('aria-label', PEN_COLORS[2]!.label)
  })

  it('selects a colour and closes on click', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<Anchored color={PEN_COLORS[0]!.value} onSelect={onSelect} onClose={onClose} />)
    fireEvent.click(screen.getByRole('menuitemradio', { name: PEN_COLORS[3]!.label }))
    expect(onSelect).toHaveBeenCalledWith(PEN_COLORS[3]!.value)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Anchored color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />)
    vi.runAllTimers()
    vi.useRealTimers()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a click outside the popover', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(
      <div>
        <button>elsewhere</button>
        <Anchored color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />
      </div>,
    )
    vi.runAllTimers()
    vi.useRealTimers()
    fireEvent.pointerDown(screen.getByText('elsewhere'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close from the same click that opened it', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Anchored color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />)
    // Before the setTimeout(0) inside the component has run, an outside
    // pointerdown must not be wired up yet - otherwise the very right-click
    // that opened the popover (which bubbles as a pointerdown too) would
    // immediately close it again.
    fireEvent.pointerDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('closes when the page scrolls or resizes, since its position would go stale', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Anchored color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />)
    vi.runAllTimers()
    vi.useRealTimers()
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalled()
  })
})
