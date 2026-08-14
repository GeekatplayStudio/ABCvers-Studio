import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PenColorPicker } from './PenColorPicker'
import { PEN_COLORS } from '../lib/draw'

describe('PenColorPicker', () => {
  it('lists every configured colour as a menu item', () => {
    render(<PenColorPicker color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(PEN_COLORS.length)
  })

  it('marks the current colour as checked', () => {
    render(<PenColorPicker color={PEN_COLORS[2]!.value} onSelect={() => {}} onClose={() => {}} />)
    const checked = screen.getByRole('menuitemradio', { checked: true })
    expect(checked).toHaveAttribute('aria-label', PEN_COLORS[2]!.label)
  })

  it('selects a colour and closes on click', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PenColorPicker color={PEN_COLORS[0]!.value} onSelect={onSelect} onClose={onClose} />)
    fireEvent.click(screen.getByRole('menuitemradio', { name: PEN_COLORS[3]!.label }))
    expect(onSelect).toHaveBeenCalledWith(PEN_COLORS[3]!.value)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<PenColorPicker color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />)
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
        <PenColorPicker color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />
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
    render(<PenColorPicker color={PEN_COLORS[0]!.value} onSelect={() => {}} onClose={onClose} />)
    // Before the setTimeout(0) inside the component has run, an outside
    // pointerdown must not be wired up yet - otherwise the very right-click
    // that opened the popover (which bubbles as a pointerdown too) would
    // immediately close it again.
    fireEvent.pointerDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
