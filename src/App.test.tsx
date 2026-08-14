import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { useStudio } from './store/useStudio'
import { syncEngine } from './lib/sync'

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
    aspect: 'free',
    fitMode: 'fit',
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

  it('lays panels out in rows of the chosen column count', () => {
    render(<App />)
    addMedia(...Array.from({ length: 6 }, (_, i) => fakeFile(`c${i}.mp4`)))
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(useStudio.getState().columns).toBe(2)
    expect(document.querySelectorAll('.row')).toHaveLength(3)
  })

  it('locks every panel to a chosen aspect ratio', () => {
    render(<App />)
    addMedia(fakeFile('a.mp4'))
    fireEvent.click(screen.getByRole('button', { name: '1:1' }))
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

  it('number keys set the column count', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: '3' })
    expect(useStudio.getState().columns).toBe(3)
    fireEvent.keyDown(window, { key: '0' })
    expect(useStudio.getState().columns).toBe('auto')
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

