import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GridSizeControl } from './GridSizeControl'

function withTrackWidth(width = 100) {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0, width, height: 22, right: width, bottom: 22, x: 0, y: 0, toJSON: () => ({}) })
  return () => spy.mockRestore()
}

/** Nine panels whose largest width-filling grid is four across. */
const nine = { count: 9, fitColumns: 4 }

describe('GridSizeControl', () => {
  it('runs small to large: one line at the left, the largest fitting grid at the right', () => {
    const { rerender } = render(<GridSizeControl {...nine} columns={9} onColumns={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Panel size' })
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '5') // 9 across down to 4
    expect(slider).toHaveAttribute('aria-valuenow', '0') // nine across: smallest

    rerender(<GridSizeControl {...nine} columns={4} onColumns={() => {}} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '5')
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '4 screens per row')
  })

  it('stops where the panels would start shrinking again', () => {
    // Three across would be *fewer* columns but *smaller* pictures, since the
    // extra row has to come out of the same height - and black bars with it.
    const onColumns = vi.fn()
    render(<GridSizeControl {...nine} columns={4} onColumns={onColumns} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onColumns).toHaveBeenLastCalledWith(4)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' })
    expect(onColumns).toHaveBeenLastCalledWith(4)
  })

  it('shows no numbers at all - the ends are a small and a large square', () => {
    const { container } = render(<GridSizeControl {...nine} columns={6} onColumns={() => {}} />)
    expect(container.textContent).toBe('')
    expect(container.querySelectorAll('.gridsize__end')).toHaveLength(2)
  })

  it('dragging right makes panels bigger, which is fewer per row', () => {
    const restore = withTrackWidth(100)
    const onColumns = vi.fn()
    render(<GridSizeControl {...nine} columns={9} onColumns={onColumns} />)
    // 60% along a five-step track is index 3, which is 9 - 3 = 6 per row.
    fireEvent.pointerDown(screen.getByRole('slider'), { clientX: 60, pointerId: 1 })
    expect(onColumns).toHaveBeenCalledWith(6)
    restore()
  })

  it('nudges one step at a time and clamps at the small end too', () => {
    const onColumns = vi.fn()
    const { rerender } = render(<GridSizeControl {...nine} columns={6} onColumns={onColumns} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onColumns).toHaveBeenLastCalledWith(5) // bigger panels
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' })
    expect(onColumns).toHaveBeenLastCalledWith(7) // smaller panels

    rerender(<GridSizeControl {...nine} columns={9} onColumns={onColumns} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' })
    expect(onColumns).toHaveBeenLastCalledWith(9) // already as small as it goes
  })

  it('jumps to the extremes on Home and End', () => {
    const onColumns = vi.fn()
    render(<GridSizeControl {...nine} columns={6} onColumns={onColumns} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' })
    expect(onColumns).toHaveBeenLastCalledWith(4)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    expect(onColumns).toHaveBeenLastCalledWith(9)
  })

  it('is inert when only one grid ever fills the stage', () => {
    // Three panels on a wide screen: three across is both the smallest and the
    // largest arrangement that spans it, so there is no size to choose.
    const onColumns = vi.fn()
    const restore = withTrackWidth(100)
    render(<GridSizeControl count={3} fitColumns={3} columns={3} onColumns={onColumns} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-disabled', 'true')
    expect(slider).toHaveAttribute('tabindex', '-1')
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onColumns).not.toHaveBeenCalled()
    restore()
  })

  it('only moves while the pointer is actually down', () => {
    const restore = withTrackWidth(100)
    const onColumns = vi.fn()
    render(<GridSizeControl {...nine} columns={9} onColumns={onColumns} />)
    fireEvent.pointerMove(screen.getByRole('slider'), { clientX: 80, pointerId: 1 })
    expect(onColumns).not.toHaveBeenCalled()
    restore()
  })
})
