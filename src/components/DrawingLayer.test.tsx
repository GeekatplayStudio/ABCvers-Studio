import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { DrawingLayer } from './DrawingLayer'
import { useStudio } from '../store/useStudio'
import { DEFAULT_PEN_COLOR } from '../lib/draw'

function withLayerBox(width = 400, height = 300) {
  const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return () => spy.mockRestore()
}

const initial = useStudio.getState()

beforeEach(() => {
  useStudio.setState({ ...initial, strokes: [], drawMode: false, drawColor: DEFAULT_PEN_COLOR, zoomMode: false })
})

describe('DrawingLayer', () => {
  it('is inert (no data-active) when the pen is off', () => {
    render(<DrawingLayer />)
    expect(document.querySelector('.drawing-layer')).not.toHaveAttribute('data-active')
  })

  it('marks itself active once the pen is on', () => {
    useStudio.setState({ drawMode: true })
    render(<DrawingLayer />)
    expect(document.querySelector('.drawing-layer')).toHaveAttribute('data-active')
  })

  it('ignores a drag entirely while the pen is off', () => {
    const restore = withLayerBox()
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!
    fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, pointerId: 1, button: 0 })
    fireEvent.pointerMove(layer, { clientX: 50, clientY: 50, pointerId: 1 })
    fireEvent.pointerUp(layer, { clientX: 50, clientY: 50, pointerId: 1 })
    expect(useStudio.getState().strokes).toHaveLength(0)
    restore()
  })

  it('draws and commits a stroke while the pen is on, in the current colour', () => {
    useStudio.setState({ drawMode: true, drawColor: '#22d3ee' })
    const restore = withLayerBox(400, 300)
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!

    fireEvent.pointerDown(layer, { clientX: 40, clientY: 30, pointerId: 1, button: 0 })
    expect(screen.getByTestId('live-stroke')).toBeInTheDocument() // shown while in progress

    fireEvent.pointerMove(layer, { clientX: 200, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(layer, { clientX: 200, clientY: 150, pointerId: 1 })

    expect(screen.queryByTestId('live-stroke')).not.toBeInTheDocument() // gone once committed
    const strokes = useStudio.getState().strokes
    expect(strokes).toHaveLength(1)
    expect(strokes[0]!.color).toBe('#22d3ee')
    // 40/400=0.1, 30/300=0.1; 200/400=0.5, 150/300=0.5
    expect(strokes[0]!.points[0]).toEqual({ x: 0.1, y: 0.1 })
    expect(strokes[0]!.points.at(-1)).toEqual({ x: 0.5, y: 0.5 })
    restore()
  })

  it('does not record a second point on top of the first (below the minimum distance)', () => {
    useStudio.setState({ drawMode: true })
    const restore = withLayerBox(1000, 1000)
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!

    fireEvent.pointerDown(layer, { clientX: 100, clientY: 100, pointerId: 1, button: 0 })
    fireEvent.pointerMove(layer, { clientX: 100.5, clientY: 100.5, pointerId: 1 }) // far below MIN_POINT_DISTANCE
    fireEvent.pointerUp(layer, { clientX: 100.5, clientY: 100.5, pointerId: 1 })

    expect(useStudio.getState().strokes[0]!.points).toHaveLength(1)
    restore()
  })

  it('a click without any movement still leaves a single-point stroke (a dot)', () => {
    useStudio.setState({ drawMode: true })
    const restore = withLayerBox()
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!
    fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, pointerId: 1, button: 0 })
    fireEvent.pointerUp(layer, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(useStudio.getState().strokes).toHaveLength(1)
    expect(useStudio.getState().strokes[0]!.points).toHaveLength(1)
    restore()
  })

  it('ignores a right-click drag (only the primary button draws)', () => {
    useStudio.setState({ drawMode: true })
    const restore = withLayerBox()
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!
    fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, pointerId: 1, button: 2 })
    fireEvent.pointerMove(layer, { clientX: 50, clientY: 50, pointerId: 1 })
    fireEvent.pointerUp(layer, { clientX: 50, clientY: 50, pointerId: 1 })
    expect(useStudio.getState().strokes).toHaveLength(0)
    restore()
  })

  it('renders every persisted stroke as a pulsing path', () => {
    useStudio.setState({
      strokes: [
        { id: 's1', color: '#fff', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] },
        { id: 's2', color: '#000', points: [{ x: 0.2, y: 0.8 }] },
      ],
    })
    const restore = withLayerBox()
    render(<DrawingLayer />)
    const paths = document.querySelectorAll('.annotation-stroke:not(.annotation-stroke--live)')
    expect(paths).toHaveLength(2)
    restore()
  })

  it('suppresses the native context menu while the pen is active', () => {
    useStudio.setState({ drawMode: true })
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!
    const notPrevented = fireEvent.contextMenu(layer)
    expect(notPrevented).toBe(false) // fireEvent returns false when preventDefault was called
  })

  it('leaves the native context menu alone while the pen is off', () => {
    render(<DrawingLayer />)
    const layer = document.querySelector('.drawing-layer')!
    const notPrevented = fireEvent.contextMenu(layer)
    expect(notPrevented).toBe(true)
  })
})
