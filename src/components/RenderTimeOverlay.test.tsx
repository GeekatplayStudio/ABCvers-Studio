import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RenderTimeOverlay } from './RenderTimeOverlay'

describe('RenderTimeOverlay', () => {
  it('shows the current value and a placeholder when empty', () => {
    render(<RenderTimeOverlay value="" onChange={() => {}} label="clip.mp4" />)
    const input = screen.getByRole('textbox', { name: 'Render time for clip.mp4' })
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', expect.stringMatching(/render time/i))
  })

  it('reports every keystroke', () => {
    const onChange = vi.fn()
    render(<RenderTimeOverlay value="" onChange={onChange} label="clip.mp4" />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2m 45s' } })
    expect(onChange).toHaveBeenCalledWith('2m 45s')
  })

  it('displays whatever value it is given, including one entered earlier', () => {
    render(<RenderTimeOverlay value="1h 12m" onChange={() => {}} label="clip.mp4" />)
    expect(screen.getByRole('textbox')).toHaveValue('1h 12m')
  })

  it('stops pointer events from reaching whatever is behind it', () => {
    const onOuterPointerDown = vi.fn()
    render(
      <div onPointerDown={onOuterPointerDown}>
        <RenderTimeOverlay value="" onChange={() => {}} label="clip.mp4" />
      </div>,
    )
    // The overlay lives inside MediaSurface's interactive layer, which starts
    // a marquee-zoom drag or a pan on pointerdown - typing into this input
    // must not also do that.
    fireEvent.pointerDown(screen.getByTestId('render-time-input'))
    expect(onOuterPointerDown).not.toHaveBeenCalled()
  })
})
