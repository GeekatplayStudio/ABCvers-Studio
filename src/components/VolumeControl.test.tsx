import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VolumeControl } from './VolumeControl'

function withTrackWidth(width = 100) {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0, width, height: 14, right: width, bottom: 14, x: 0, y: 0, toJSON: () => ({}) })
  return () => spy.mockRestore()
}

describe('VolumeControl', () => {
  it('reports the level as a percentage', () => {
    render(
      <VolumeControl volume={0.4} muted={false} onVolume={() => {}} onToggleMute={() => {}} label="panel 1" />,
    )
    expect(screen.getByRole('slider', { name: 'panel 1 volume' })).toHaveAttribute('aria-valuenow', '40')
  })

  it('shows zero while muted without losing the stored level', () => {
    render(
      <VolumeControl volume={0.8} muted onVolume={() => {}} onToggleMute={() => {}} label="panel 1" />,
    )
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: 'Unmute panel 1' })).toBeInTheDocument()
  })

  it('sets the level from a click position', () => {
    const restore = withTrackWidth(100)
    const onVolume = vi.fn()
    render(
      <VolumeControl volume={1} muted={false} onVolume={onVolume} onToggleMute={() => {}} label="p" />,
    )
    fireEvent.pointerDown(screen.getByRole('slider'), { clientX: 30, pointerId: 1 })
    expect(onVolume).toHaveBeenCalledWith(0.3)
    restore()
  })

  it('nudges with the arrow keys', () => {
    const onVolume = vi.fn()
    render(
      <VolumeControl volume={0.5} muted={false} onVolume={onVolume} onToggleMute={() => {}} label="p" />,
    )
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(onVolume).toHaveBeenLastCalledWith(0.55)
    fireEvent.keyDown(slider, { key: 'ArrowDown', shiftKey: true })
    expect(onVolume).toHaveBeenLastCalledWith(0.3)
  })

  it('passes the modifier keys through so alt+click can solo', () => {
    const onToggleMute = vi.fn()
    render(
      <VolumeControl volume={1} muted={false} onVolume={() => {}} onToggleMute={onToggleMute} label="p" />,
    )
    fireEvent.click(screen.getByRole('button'), { altKey: true })
    expect(onToggleMute).toHaveBeenCalledWith(expect.objectContaining({ altKey: true }))
  })

  it('is inert for stills', () => {
    const onVolume = vi.fn()
    render(
      <VolumeControl volume={1} muted={false} onVolume={onVolume} onToggleMute={() => {}} label="p" disabled />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' })
    expect(onVolume).not.toHaveBeenCalled()
  })
})
