import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Scrubber } from './Scrubber'

/** jsdom gives every element a zero-sized box; fake a real track width. */
function withTrackWidth(width = 200) {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0, width, height: 14, right: width, bottom: 14, x: 0, y: 0, toJSON: () => ({}) })
  return () => spy.mockRestore()
}

describe('Scrubber', () => {
  it('exposes slider semantics', () => {
    render(<Scrubber duration={60} onSeek={() => {}} label="Master position" />)
    const slider = screen.getByRole('slider', { name: 'Master position' })
    expect(slider).toHaveAttribute('aria-valuemax', '60')
  })

  it('seeks to the fraction of the track that was clicked', () => {
    const restore = withTrackWidth(200)
    const onSeek = vi.fn()
    render(<Scrubber duration={100} onSeek={onSeek} label="pos" />)
    fireEvent.pointerDown(screen.getByRole('slider'), { clientX: 50, pointerId: 1, button: 0 })
    expect(onSeek).toHaveBeenCalledWith(25)
    restore()
  })

  it('only seeks while the pointer is down', () => {
    const restore = withTrackWidth(200)
    const onSeek = vi.fn()
    render(<Scrubber duration={100} onSeek={onSeek} label="pos" />)
    const slider = screen.getByRole('slider')
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 })
    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.pointerDown(slider, { clientX: 20, pointerId: 1, button: 0 })
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 })
    expect(onSeek).toHaveBeenLastCalledWith(50)

    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 })
    expect(onSeek).toHaveBeenLastCalledWith(50)
    restore()
  })

  it('brackets a drag with scrub start/end so playback can resume', () => {
    const restore = withTrackWidth(200)
    const onScrubStart = vi.fn()
    const onScrubEnd = vi.fn()
    render(
      <Scrubber
        duration={100}
        onSeek={() => {}}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        label="pos"
      />,
    )
    const slider = screen.getByRole('slider')
    fireEvent.pointerDown(slider, { clientX: 10, pointerId: 1, button: 0 })
    expect(onScrubStart).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(slider, { clientX: 10, pointerId: 1 })
    expect(onScrubEnd).toHaveBeenCalledTimes(1)
    restore()
  })

  it('supports keyboard nudging', () => {
    const onSeek = vi.fn()
    render(<Scrubber duration={100} onSeek={onSeek} label="pos" time={0} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(0.1)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onSeek).toHaveBeenLastCalledWith(100)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSeek).toHaveBeenLastCalledWith(0)
  })

  it('goes inert with no duration', () => {
    const onSeek = vi.fn()
    render(<Scrubber duration={0} onSeek={onSeek} label="pos" />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-disabled', 'true')
    fireEvent.pointerDown(slider, { clientX: 40, pointerId: 1, button: 0 })
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('paints from the bound source without re-rendering', () => {
    let push: ((time: number) => void) | null = null
    const bind = (setTime: (time: number) => void) => {
      push = setTime
      return () => {}
    }
    render(<Scrubber duration={100} onSeek={() => {}} label="pos" bind={bind} />)
    expect(push).not.toBeNull()
    push!(25)
    expect(screen.getByRole('slider').style.getPropertyValue('--progress')).toBe('25.000%')
    expect(screen.getByText('0:25.000')).toBeInTheDocument()
  })
})
