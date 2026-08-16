import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Dropdown } from './Dropdown'

const OPTIONS = [
  { value: 'free', label: 'Free', hint: 'Own ratio' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
]

function setup(value = 'free', onChange = vi.fn()) {
  render(<Dropdown label="Aspect ratio" value={value} options={OPTIONS} onChange={onChange} />)
  return { trigger: screen.getByRole('button', { name: 'Aspect ratio' }), onChange }
}

describe('Dropdown', () => {
  it('shows the chosen label and keeps the list closed until asked', () => {
    const { trigger } = setup('16:9')
    expect(trigger).toHaveTextContent('16:9')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens on click, selects on click, and closes again', () => {
    const { trigger, onChange } = setup()
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox', { name: 'Aspect ratio' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '1:1' }))
    expect(onChange).toHaveBeenCalledWith('1:1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('marks the current value as selected', () => {
    setup('1:1')
    fireEvent.click(screen.getByRole('button', { name: 'Aspect ratio' }))
    expect(screen.getByRole('option', { name: '1:1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: '16:9' })).toHaveAttribute('aria-selected', 'false')
  })

  it('opens with the arrow keys and walks the list from the current value', () => {
    const { trigger, onChange } = setup('16:9')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    // Starts on the selected row, so one step down is the row after it.
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('1:1')
  })

  it('clamps arrow walking at both ends, and Home/End jump to them', () => {
    const { trigger, onChange } = setup('free')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowUp' }) // already at the top
    fireEvent.keyDown(list, { key: 'End' })
    fireEvent.keyDown(list, { key: 'ArrowDown' }) // already at the bottom
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('1:1')
  })

  it('closes on Escape without choosing anything, and hands focus back', () => {
    const { trigger, onChange } = setup()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside click, but not on the click that opened it', () => {
    vi.useFakeTimers()
    try {
      const { trigger } = setup()
      fireEvent.click(trigger)
      // The opening click's own pointerdown must not close it again.
      fireEvent.pointerDown(document.body)
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      vi.runOnlyPendingTimers()
      fireEvent.pointerDown(document.body)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes when the page scrolls, since it is placed by screen coordinates', () => {
    vi.useFakeTimers()
    try {
      setup()
      fireEvent.click(screen.getByRole('button', { name: 'Aspect ratio' }))
      vi.runOnlyPendingTimers()
      fireEvent.scroll(window)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cannot be opened while disabled', () => {
    render(
      <Dropdown label="Aspect ratio" value="free" options={OPTIONS} onChange={() => {}} disabled />,
    )
    const trigger = screen.getByRole('button', { name: 'Aspect ratio' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
