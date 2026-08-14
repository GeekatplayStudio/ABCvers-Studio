import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExposureControl } from './ExposureControl'

function withTrackWidth(width = 100) {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0, width, height: 14, right: width, bottom: 14, x: 0, y: 0, toJSON: () => ({}) })
  return () => spy.mockRestore()
}

describe('ExposureControl', () => {
  it('reports the value and range for the default -6..6 stop scale', () => {
    render(<ExposureControl value={1.5} onChange={() => {}} label="beauty.exr" />)
    const slider = screen.getByRole('slider', { name: 'beauty.exr exposure' })
    expect(slider).toHaveAttribute('aria-valuemin', '-6')
    expect(slider).toHaveAttribute('aria-valuemax', '6')
    expect(slider).toHaveAttribute('aria-valuenow', '1.5')
  })

  it('shows a signed readout, and no stray sign or trailing zeros at exactly zero', () => {
    const { rerender } = render(<ExposureControl value={2} onChange={() => {}} label="p" />)
    expect(screen.getByText('+2 EV')).toBeInTheDocument()
    rerender(<ExposureControl value={-1.5} onChange={() => {}} label="p" />)
    expect(screen.getByText('-1.5 EV')).toBeInTheDocument()
    rerender(<ExposureControl value={0} onChange={() => {}} label="p" />)
    expect(screen.getByText('0 EV')).toBeInTheDocument()
  })

  it('sets the value from a click position, snapped to the quarter-stop grid', () => {
    const restore = withTrackWidth(100)
    const onChange = vi.fn()
    render(<ExposureControl value={0} onChange={onChange} label="p" min={-6} max={6} />)
    // 10% across a [-6, 6] range is -4.8, which snaps to -4.75.
    fireEvent.pointerDown(screen.getByRole('slider'), { clientX: 10, pointerId: 1 })
    expect(onChange).toHaveBeenCalledWith(-4.75)
    restore()
  })

  it('nudges by a quarter stop, or a full stop with shift', () => {
    const onChange = vi.fn()
    render(<ExposureControl value={0} onChange={onChange} label="p" />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(0.25)
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(-1)
  })

  it('resets to zero on Home, and clamps nudges to the configured range', () => {
    const onChange = vi.fn()
    render(<ExposureControl value={5.9} onChange={onChange} label="p" min={-6} max={6} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(6) // clamped, not 6.15
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('the reset button resets to zero and disables itself once already there', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ExposureControl value={3} onChange={onChange} label="p" />)
    const resetButton = screen.getByRole('button', { name: 'Reset p exposure' })
    expect(resetButton).toBeEnabled()
    fireEvent.click(resetButton)
    expect(onChange).toHaveBeenCalledWith(0)

    rerender(<ExposureControl value={0} onChange={onChange} label="p" />)
    expect(screen.getByRole('button', { name: 'Reset p exposure' })).toBeDisabled()
  })

  it('only moves while the pointer is actually down', () => {
    const restore = withTrackWidth(100)
    const onChange = vi.fn()
    render(<ExposureControl value={0} onChange={onChange} label="p" />)
    const slider = screen.getByRole('slider')
    fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
    restore()
  })
})
