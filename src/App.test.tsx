import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { useStudio } from './store/useStudio'
import { syncEngine } from './lib/sync'
import { DEFAULT_PEN_COLOR } from './lib/draw'

function fakeFile(name: string, type = 'video/mp4', size = 4096): File {
  return { name, type, size, lastModified: 1_700_000_000_000 } as File
}

/** Store mutations from outside React have to be flushed like user events. */
function addMedia(...files: File[]): void {
  act(() => {
    useStudio.getState().addFiles(files)
  })
}

const initial = useStudio.getState()

beforeEach(() => {
  useStudio.setState({
    ...initial,
    items: [],
    zoom: null,
    zoomMode: false,
    toasts: [],
    columns: 'auto',
    layout: 'row',
    aspect: 'free',
    fitMode: 'fit',
    strokes: [],
    drawMode: false,
    drawColor: DEFAULT_PEN_COLOR,
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

describe('ABCvers Studio shell', () => {
  it('shows the brand and the empty state on a cold start', () => {
    render(<App />)
    expect(screen.getByText('ABCvers Studio')).toBeInTheDocument()
    expect(screen.getByText(/Geekatplay Studio/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Compare side by side' })).toBeInTheDocument()
  })

  it('renders one panel per media item, with its info strip', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'), fakeFile('b.mp4'), fakeFile('c.png', 'image/png'))
    const panels = screen.getAllByRole('region')
    expect(panels).toHaveLength(3)
    expect(within(panels[0]!).getByTestId(/^meta-/)).toBeInTheDocument()
    expect(screen.getByText('3/12')).toBeInTheDocument()
  })

  it('closes a single panel from its own close button', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'), fakeFile('b.mp4'))
    fireEvent.click(screen.getByRole('button', { name: 'Close a.mp4' }))
    expect(useStudio.getState().items.map((i) => i.name)).toEqual(['b.mp4'])
  })

  it('reorders panels with the move buttons', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'), fakeFile('b.mp4'))
    fireEvent.click(screen.getByRole('button', { name: 'Move b.mp4 left' }))
    expect(useStudio.getState().items.map((i) => i.name)).toEqual(['b.mp4', 'a.mp4'])
  })

  it('hides and shows the info strips', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    expect(screen.getByTestId(/^meta-/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle media info' }))
    expect(screen.queryByTestId(/^meta-/)).not.toBeInTheDocument()
  })

  it('render-time boxes: off by default, typed values survive hiding, gone once the panel closes', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'), fakeFile('b.mp4'))
    expect(screen.queryByTestId('render-time-input')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle render time boxes' }))
    const inputs = screen.getAllByTestId('render-time-input')
    expect(inputs).toHaveLength(2)
    fireEvent.change(inputs[0]!, { target: { value: '2m 45s' } })

    // hide
    fireEvent.click(screen.getByRole('button', { name: 'Toggle render time boxes' }))
    expect(screen.queryByTestId('render-time-input')).not.toBeInTheDocument()
    expect(useStudio.getState().items[0]!.renderTime).toBe('2m 45s') // saved while hidden

    // show again - the typed value is still there
    fireEvent.click(screen.getByRole('button', { name: 'Toggle render time boxes' }))
    expect(screen.getAllByTestId('render-time-input')[0]).toHaveValue('2m 45s')

    // closing the panel drops its value for good
    fireEvent.click(screen.getByRole('button', { name: 'Close a.mp4' }))
    expect(useStudio.getState().items.map((i) => i.renderTime)).toEqual([''])
  })

  it('switches between row and grid layout', () => {
    render(<App />)
    addMedia(...Array.from({ length: 6 }, (_, i) => fakeFile(`c${i}.mp4`)))
    expect(document.querySelectorAll('.row')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    expect(useStudio.getState().layout).toBe('grid')
    expect(document.querySelectorAll('.row')).toHaveLength(2) // 3 x 2

    fireEvent.click(screen.getByRole('button', { name: 'Row' }))
    expect(document.querySelectorAll('.row')).toHaveLength(1)
  })

  it('sizes the grid from one slider, with no shape presets anywhere', () => {
    render(<App />)
    addMedia(...Array.from({ length: 6 }, (_, i) => fakeFile(`c${i}.mp4`)))

    // The control only exists once there is a grid to size.
    expect(screen.queryByRole('slider', { name: 'Panel size' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))

    const size = screen.getByRole('slider', { name: 'Panel size' })
    expect(size).toHaveAttribute('aria-valuetext', '3 screens per row')

    // Left is smaller panels, so more of them fit on a line.
    fireEvent.keyDown(size, { key: 'ArrowLeft' })
    expect(useStudio.getState().columns).toBe(4)
    expect(document.querySelectorAll('.row')).toHaveLength(2)

    // Home is the smallest of all: every panel back on one line.
    fireEvent.keyDown(size, { key: 'Home' })
    expect(useStudio.getState().columns).toBe(6)
    expect(document.querySelectorAll('.row')).toHaveLength(1)

    // Right is bigger panels, and it stops at the largest that still spans
    // the stage rather than carrying on into black bars.
    fireEvent.keyDown(size, { key: 'End' })
    expect(useStudio.getState().columns).toBe(3)
    fireEvent.keyDown(size, { key: 'ArrowRight' })
    expect(useStudio.getState().columns).toBe(3)
    expect(document.querySelectorAll('.row')).toHaveLength(2)
  })

  it('going back to a row drops the grid size, so the toggle never lies', () => {
    render(<App />)
    addMedia(...Array.from({ length: 6 }, (_, i) => fakeFile(`c${i}.mp4`)))
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Panel size' }), { key: 'ArrowLeft' })
    expect(useStudio.getState().columns).toBe(4)

    fireEvent.click(screen.getByRole('button', { name: 'Row' }))
    expect(useStudio.getState().columns).toBe('auto')
    expect(document.querySelectorAll('.row')).toHaveLength(1)
  })

  it('locks every panel to a chosen aspect ratio', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    fireEvent.click(screen.getByRole('button', { name: 'Aspect ratio' }))
    fireEvent.click(screen.getByRole('option', { name: '1:1' }))
    expect(useStudio.getState().aspect).toBe('1:1')
    expect((document.querySelector('.stage') as HTMLElement).dataset.locked).toBe('true')
  })

  it('switches the picture between fit and fill', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    expect(document.querySelector('.surface')).toHaveAttribute('data-fit', 'fit')
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    expect(useStudio.getState().fitMode).toBe('fill')
    expect(document.querySelector('.surface')).toHaveAttribute('data-fit', 'fill')
  })

  it('drives zoom mode and the reset button from the toolbar', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    const zoomButton = screen.getByRole('button', { name: /Zoom/ })
    fireEvent.click(zoomButton)
    expect(useStudio.getState().zoomMode).toBe(true)

    act(() => useStudio.getState().setZoom({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }))
    expect(screen.getByTitle('Current magnification')).toHaveTextContent('2.0x')
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(useStudio.getState().zoom).toBeNull()
  })

  it('the pen: toggles from the toolbar, draws across the whole stage, and clears from one button', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'), fakeFile('b.mp4'))
    const penButton = screen.getByRole('button', { name: /^Pen/ })

    fireEvent.click(penButton)
    expect(useStudio.getState().drawMode).toBe(true)

    // Drawing lands on the shared overlay, not on either panel individually -
    // it exists precisely so a stroke can cross from one panel into the next.
    const layer = document.querySelector('.drawing-layer')!
    fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, pointerId: 1, button: 0 })
    fireEvent.pointerMove(layer, { clientX: 80, clientY: 40, pointerId: 1 })
    fireEvent.pointerUp(layer, { clientX: 80, clientY: 40, pointerId: 1 })
    expect(useStudio.getState().strokes).toHaveLength(1)

    const clearButton = screen.getByRole('button', { name: 'Clear every drawing' })
    expect(clearButton).toBeEnabled()
    fireEvent.click(clearButton)
    expect(useStudio.getState().strokes).toHaveLength(0)
    expect(clearButton).toBeDisabled()
  })

  it('right-clicking the pen opens a colour picker, and picking a colour applies to new strokes', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    const penButton = screen.getByRole('button', { name: /^Pen/ })

    fireEvent.contextMenu(penButton)
    const cyan = screen.getByRole('menuitemradio', { name: 'Cyan' })
    fireEvent.click(cyan)
    expect(useStudio.getState().drawColor).toBe('#22d3ee')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument() // closes after picking
  })

  it('turning on the pen from the toolbar turns off marquee-zoom, and vice versa', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    fireEvent.click(screen.getByRole('button', { name: /^Pen/ }))
    expect(useStudio.getState().drawMode).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /^Zoom/ }))
    expect(useStudio.getState().zoomMode).toBe(true)
    expect(useStudio.getState().drawMode).toBe(false)
  })

  it('loops by default, and the loop button reflects it', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    expect(useStudio.getState().loop).toBe(true)
    const loopButton = screen.getByRole('button', { name: 'Loop playback' })
    expect(loopButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(loopButton)
    expect(useStudio.getState().loop).toBe(false)
  })

  it('offers a coffee link at the top and the bottom', () => {
    render(<App />)
    const links = screen.getAllByRole('link', { name: /Buy me a coffee/ })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://geekatplay.gumroad.com/coffee')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('warns instead of failing when an unsupported file is added', () => {
    render(<App />)
    addMedia(fakeFile('notes.pdf', 'application/pdf'))
    expect(screen.getByRole('status')).toHaveTextContent('notes.pdf')
    expect(screen.getByRole('heading', { name: 'Compare side by side' })).toBeInTheDocument()
  })
})

describe('frame by frame navigation', () => {
  it('steps in both directions from the transport, one frame and ten', () => {
    const step = vi.spyOn(syncEngine, 'step').mockImplementation(() => {})
    render(<App />)
    addMedia(fakeFile('a.mp4'))

    fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }))
    expect(step).toHaveBeenLastCalledWith(-1)
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }))
    expect(step).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back 10 frames' }))
    expect(step).toHaveBeenLastCalledWith(-10)
    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 frames' }))
    expect(step).toHaveBeenLastCalledWith(10)
    step.mockRestore()
  })

  it('steps from any panel, and moves every panel with it', () => {
    const step = vi.spyOn(syncEngine, 'step').mockImplementation(() => {})
    render(<App />)
    addMedia(fakeFile('a.mp4'), fakeFile('b.mp4'))

    fireEvent.click(screen.getByRole('button', { name: 'Next frame, from b.mp4' }))
    expect(step).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Previous frame, from a.mp4' }))
    expect(step).toHaveBeenLastCalledWith(-1)
    step.mockRestore()
  })

  it('gives stills no frame controls', () => {
    render(<App />)
    addMedia(fakeFile('plate.png', 'image/png'))
    expect(screen.queryByRole('button', { name: /frame, from plate\.png/ })).not.toBeInTheDocument()
  })
})

describe('keyboard shortcuts', () => {
  it('space toggles the shared transport', () => {
    const toggle = vi.spyOn(syncEngine, 'toggle').mockImplementation(() => {})
    render(<App />)
    fireEvent.keyDown(window, { key: ' ' })
    expect(toggle).toHaveBeenCalled()
    toggle.mockRestore()
  })

  it('arrows step frames, shift+arrow jumps a second', () => {
    const step = vi.spyOn(syncEngine, 'step').mockImplementation(() => {})
    const seekBy = vi.spyOn(syncEngine, 'seekBy').mockImplementation(() => {})
    render(<App />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(step).toHaveBeenCalledWith(1)
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true })
    expect(seekBy).toHaveBeenCalledWith(-1)
    step.mockRestore()
    seekBy.mockRestore()
  })

  it('comma and period step one frame in either direction', () => {
    const step = vi.spyOn(syncEngine, 'step').mockImplementation(() => {})
    render(<App />)
    fireEvent.keyDown(window, { key: ',' })
    expect(step).toHaveBeenLastCalledWith(-1)
    fireEvent.keyDown(window, { key: '.' })
    expect(step).toHaveBeenLastCalledWith(1)
    step.mockRestore()
  })

  it('angle brackets jog ten frames in either direction', () => {
    const step = vi.spyOn(syncEngine, 'step').mockImplementation(() => {})
    render(<App />)
    fireEvent.keyDown(window, { key: '<' })
    expect(step).toHaveBeenLastCalledWith(-10)
    fireEvent.keyDown(window, { key: '>' })
    expect(step).toHaveBeenLastCalledWith(10)
    step.mockRestore()
  })

  it('z, r and m reach the store', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'z' })
    expect(useStudio.getState().zoomMode).toBe(true)
    act(() => useStudio.getState().setZoom({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }))
    fireEvent.keyDown(window, { key: 'r' })
    expect(useStudio.getState().zoom).toBeNull()

    const before = useStudio.getState().globalMuted
    fireEvent.keyDown(window, { key: 'm' })
    expect(useStudio.getState().globalMuted).toBe(!before)
  })

  it('t toggles the render-time boxes', () => {
    render(<App />)
    expect(useStudio.getState().showRenderTime).toBe(false)
    fireEvent.keyDown(window, { key: 't' })
    expect(useStudio.getState().showRenderTime).toBe(true)
    fireEvent.keyDown(window, { key: 't' })
    expect(useStudio.getState().showRenderTime).toBe(false)
  })

  it('p toggles the pen, and Escape leaves it', () => {
    render(<App />)
    expect(useStudio.getState().drawMode).toBe(false)
    fireEvent.keyDown(window, { key: 'p' })
    expect(useStudio.getState().drawMode).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useStudio.getState().drawMode).toBe(false)
  })

  it('bracket keys step panel size, which means a grid', () => {
    render(<App />)
    addMedia(...Array.from({ length: 6 }, (_, i) => fakeFile(`c${i}.mp4`)))

    // Smaller panels: more of them per row, and a grid to put them in.
    fireEvent.keyDown(window, { key: '[' })
    expect(useStudio.getState().layout).toBe('grid')
    expect(useStudio.getState().columns).toBe(6)

    fireEvent.keyDown(window, { key: ']' })
    expect(useStudio.getState().columns).toBe(5)

    fireEvent.keyDown(window, { key: '0' })
    expect(useStudio.getState().columns).toBe('auto')
  })

  it('G toggles row and grid layout', () => {
    render(<App />)
    expect(useStudio.getState().layout).toBe('row')
    fireEvent.keyDown(window, { key: 'g' })
    expect(useStudio.getState().layout).toBe('grid')
    fireEvent.keyDown(window, { key: 'g' })
    expect(useStudio.getState().layout).toBe('row')
  })

  it('stands down while a slider has focus', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    const slider = screen.getAllByRole('slider')[0]!
    fireEvent.keyDown(slider, { key: 'z' })
    expect(useStudio.getState().zoomMode).toBe(false)
  })

  it('typing "t" while entering a render time does not toggle the boxes away mid-word', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle render time boxes' }))
    expect(useStudio.getState().showRenderTime).toBe(true)
    const input = screen.getByTestId('render-time-input')
    fireEvent.keyDown(input, { key: 't' })
    expect(useStudio.getState().showRenderTime).toBe(true) // "took 2 minutes" must not blink the box away
  })

  it('? opens the shortcut reference and escape closes it', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

