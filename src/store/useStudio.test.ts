import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveVolume, useStudio } from './useStudio'
import { MAX_PANELS } from '../lib/guards'
import { DEFAULT_PEN_COLOR, MAX_STROKES } from '../lib/draw'
import type { MediaItem, Stroke } from '../types'

function fakeFile(name: string, type = 'video/mp4', size = 4096): File {
  return { name, type, size, lastModified: 1_700_000_000_000 } as File
}

const initial = useStudio.getState()

beforeEach(() => {
  useStudio.setState({
    ...initial,
    items: [],
    zoom: null,
    zoomMode: false,
    globalVolume: 1,
    globalMuted: true,
    toasts: [],
    aspect: 'free',
    fitMode: 'fit',
    columns: 'auto',
    layout: 'row',
    showRenderTime: false,
    strokes: [],
    drawMode: false,
    drawColor: DEFAULT_PEN_COLOR,
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

const ids = () => useStudio.getState().items.map((item) => item.id)

describe('adding and removing media', () => {
  it('adds supported files and skips the rest with a toast', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('doc.pdf', 'application/pdf')])
    const state = useStudio.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0]!.name).toBe('a.mp4')
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0]!.tone).toBe('warn')
  })

  it('ignores an empty drop', () => {
    useStudio.getState().addFiles([])
    expect(useStudio.getState().items).toHaveLength(0)
    expect(useStudio.getState().toasts).toHaveLength(0)
  })

  it('stops at the panel limit', () => {
    const files = Array.from({ length: MAX_PANELS + 3 }, (_, i) => fakeFile(`c${i}.mp4`))
    useStudio.getState().addFiles(files)
    expect(useStudio.getState().items).toHaveLength(MAX_PANELS)
  })

  it('releases the object URL when a panel closes', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().removeItem(id)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.mp4')
    expect(useStudio.getState().items).toHaveLength(0)
  })

  it('clears everything and drops the zoom', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4')])
    useStudio.getState().setZoom({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    useStudio.getState().clearAll()
    expect(useStudio.getState().items).toHaveLength(0)
    expect(useStudio.getState().zoom).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('reorders panels and refuses to walk off the ends', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4'), fakeFile('c.mp4')])
    const [a, b, c] = ids()
    useStudio.getState().moveItem(c!, -1)
    expect(ids()).toEqual([a, c, b])
    useStudio.getState().moveItem(a!, -1)
    expect(ids()).toEqual([a, c, b])
    useStudio.getState().moveItem('missing', 1)
    expect(ids()).toEqual([a, c, b])
  })
})

describe('metadata', () => {
  it('marks an item ready once metadata arrives', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().setMeta(id, { width: 1920, height: 1080, duration: 12, fps: 0 })
    const item = useStudio.getState().items[0]!
    expect(item.status).toBe('ready')
    expect(item.meta?.width).toBe(1920)
  })

  it('fills in the probed frame rate later, and ignores a bad probe', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().setMeta(id, { width: 1920, height: 1080, duration: 12, fps: 0 })
    useStudio.getState().setFps(id, 23.976)
    expect(useStudio.getState().items[0]!.meta?.fps).toBeCloseTo(23.976)
    useStudio.getState().setFps(id, 0)
    expect(useStudio.getState().items[0]!.meta?.fps).toBeCloseTo(23.976)
  })

  it('records a decode failure', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().setStatus(id, 'error', 'bad codec')
    expect(useStudio.getState().items[0]).toMatchObject({ status: 'error', error: 'bad codec' })
  })
})

describe('zoom', () => {
  it('stores a clamped rect and treats a full frame as no zoom', () => {
    useStudio.getState().setZoom({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 })
    expect(useStudio.getState().zoom).toMatchObject({ x: 0.5, y: 0.5 })
    useStudio.getState().setZoom({ x: 0, y: 0, w: 1, h: 1 })
    expect(useStudio.getState().zoom).toBeNull()
  })

  it('zooms in and back out to nothing', () => {
    useStudio.getState().zoomBy(2)
    expect(useStudio.getState().zoom).not.toBeNull()
    useStudio.getState().zoomBy(0.5)
    expect(useStudio.getState().zoom).toBeNull()
  })

  it('resets', () => {
    useStudio.getState().setZoom({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 })
    useStudio.getState().resetZoom()
    expect(useStudio.getState().zoom).toBeNull()
  })

  it('toggles marquee mode', () => {
    useStudio.getState().toggleZoomMode()
    expect(useStudio.getState().zoomMode).toBe(true)
    useStudio.getState().setZoomMode(false)
    expect(useStudio.getState().zoomMode).toBe(false)
  })

  it('turning on marquee mode turns off the pen - a drag can only mean one thing', () => {
    useStudio.getState().toggleDrawMode()
    expect(useStudio.getState().drawMode).toBe(true)
    useStudio.getState().toggleZoomMode()
    expect(useStudio.getState().zoomMode).toBe(true)
    expect(useStudio.getState().drawMode).toBe(false)
  })
})

describe('audio', () => {
  const build = (over: Partial<MediaItem> = {}): MediaItem => ({
    id: 'a',
    name: 'a.mp4',
    size: 1,
    mimeType: 'video/mp4',
    lastModified: 0,
    kind: 'video',
    url: 'blob:a',
    status: 'ready',
    meta: null,
    volume: 1,
    muted: false,
    weight: null,
    imageDecoder: null,
    exposure: 0,
    renderTime: '',
    ...over,
  })

  it('multiplies panel volume by the global volume', () => {
    expect(effectiveVolume(build({ volume: 0.5 }), 0.5, false)).toBeCloseTo(0.25)
  })

  it('global mute wins over everything', () => {
    expect(effectiveVolume(build({ volume: 1 }), 1, true)).toBe(0)
    expect(effectiveVolume(build({ muted: true }), 1, false)).toBe(0)
  })

  it('clamps a nonsense volume', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().setItemVolume(id, 5)
    expect(useStudio.getState().items[0]!.volume).toBe(1)
    useStudio.getState().setItemVolume(id, -2)
    expect(useStudio.getState().items[0]!.volume).toBe(0)
  })

  it('raising a muted panel unmutes it', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().toggleItemMute(id)
    expect(useStudio.getState().items[0]!.muted).toBe(true)
    useStudio.getState().setItemVolume(id, 0.6)
    expect(useStudio.getState().items[0]!.muted).toBe(false)
  })

  it('solo mutes every other panel, and a second solo restores them', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4'), fakeFile('c.mp4')])
    const [a, b, c] = ids()
    useStudio.getState().soloItem(b!)
    const muted = Object.fromEntries(useStudio.getState().items.map((i) => [i.id, i.muted]))
    expect(muted[a!]).toBe(true)
    expect(muted[b!]).toBe(false)
    expect(muted[c!]).toBe(true)
    expect(useStudio.getState().globalMuted).toBe(false)

    useStudio.getState().soloItem(b!)
    expect(useStudio.getState().items.every((i) => !i.muted)).toBe(true)
  })

  it('toggles the global mute', () => {
    useStudio.setState({ globalMuted: false })
    useStudio.getState().toggleGlobalMute()
    expect(useStudio.getState().globalMuted).toBe(true)
  })
})

describe('layout state', () => {
  it('clamps the column count', () => {
    useStudio.getState().setColumns(99)
    expect(useStudio.getState().columns).toBe(MAX_PANELS)
    useStudio.getState().setColumns('auto')
    expect(useStudio.getState().columns).toBe('auto')
  })

  it('toggles between row and grid', () => {
    expect(useStudio.getState().layout).toBe('row')
    useStudio.getState().toggleLayout()
    expect(useStudio.getState().layout).toBe('grid')
    useStudio.getState().toggleLayout()
    expect(useStudio.getState().layout).toBe('row')
    useStudio.getState().setLayout('grid')
    expect(useStudio.getState().layout).toBe('grid')
  })

  it('treats a fixed column count as a grid, and keeps it while the grid lasts', () => {
    // Two screens per row *is* a grid; leaving the toggle on "Row" while the
    // stage is visibly wrapped would make it a lie.
    useStudio.getState().setColumns(2)
    expect(useStudio.getState().layout).toBe('grid')
    useStudio.getState().setLayout('grid')
    expect(useStudio.getState().columns).toBe(2)
  })

  it('drops the grid size on the way back to a row, where it means nothing', () => {
    useStudio.getState().setColumns(3)
    useStudio.getState().setLayout('row')
    expect(useStudio.getState().columns).toBe('auto')

    useStudio.getState().setColumns(3)
    useStudio.getState().toggleLayout()
    expect(useStudio.getState().layout).toBe('row')
    expect(useStudio.getState().columns).toBe('auto')
  })

  it('leaves the layout alone for auto columns, which suits either mode', () => {
    useStudio.getState().setLayout('grid')
    useStudio.getState().setColumns('auto')
    expect(useStudio.getState().layout).toBe('grid')
    expect(useStudio.getState().columns).toBe('auto')
  })

  it('panels start on auto widths so their pictures sit edge to edge', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    expect(useStudio.getState().items[0]!.weight).toBeNull()
  })

  it('changing the aspect resets hand-tuned panel widths', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4')])
    const [a, b] = ids()
    useStudio.getState().resizeSplit(a!, b!, 0.2)
    expect(useStudio.getState().items[0]!.weight).not.toBeNull()
    useStudio.getState().setAspect('16:9')
    expect(useStudio.getState().items.every((i) => i.weight === null)).toBe(true)
  })

  it('resetWidths restores the automatic layout', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4')])
    const [a, b] = ids()
    useStudio.getState().resizeSplit(a!, b!, 0.2)
    useStudio.getState().resetWidths()
    expect(useStudio.getState().items.every((i) => i.weight === null)).toBe(true)
  })

  it('a splitter drag starts from the on-screen width and conserves the pair total', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4')])
    const [a, b] = ids()
    // Metadata has not arrived, so both panels sit on the 16:9 fallback.
    useStudio.getState().resizeSplit(a!, b!, 0.25)
    const items = useStudio.getState().items
    const total = (16 / 9) * 2
    expect(items[0]!.weight! + items[1]!.weight!).toBeCloseTo(total)
    expect(items[0]!.weight!).toBeGreaterThan(items[1]!.weight!)
  })

  it('switches fit mode', () => {
    expect(useStudio.getState().fitMode).toBe('fit')
    useStudio.getState().setFitMode('fill')
    expect(useStudio.getState().fitMode).toBe('fill')
  })

  it('ignores a splitter drag naming a missing panel', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    expect(() => useStudio.getState().resizeSplit(ids()[0]!, 'gone', 0.2)).not.toThrow()
  })
})

describe('toasts', () => {
  it('keeps at most four and can be dismissed', () => {
    for (let i = 0; i < 8; i++) useStudio.getState().pushToast(`m${i}`)
    expect(useStudio.getState().toasts).toHaveLength(4)
    const id = useStudio.getState().toasts[0]!.id
    useStudio.getState().dismissToast(id)
    expect(useStudio.getState().toasts.find((t) => t.id === id)).toBeUndefined()
  })
})

describe('render time', () => {
  it('starts blank for a new item, and off by default', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    expect(useStudio.getState().items[0]!.renderTime).toBe('')
    expect(useStudio.getState().showRenderTime).toBe(false)
  })

  it('toggles the global visibility flag', () => {
    useStudio.getState().toggleRenderTime()
    expect(useStudio.getState().showRenderTime).toBe(true)
    useStudio.getState().toggleRenderTime()
    expect(useStudio.getState().showRenderTime).toBe(false)
  })

  it('sets a value on exactly the named item, leaving others untouched', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4'), fakeFile('b.mp4')])
    const [a] = ids()
    useStudio.getState().setRenderTime(a!, '2m 45s')
    expect(useStudio.getState().items[0]!.renderTime).toBe('2m 45s')
    expect(useStudio.getState().items[1]!.renderTime).toBe('')
  })

  it('keeps the value while the overlay is hidden, and shows it again when reopened', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().toggleRenderTime() // show
    useStudio.getState().setRenderTime(id, '1h 12m')
    useStudio.getState().toggleRenderTime() // hide
    expect(useStudio.getState().items[0]!.renderTime).toBe('1h 12m') // still there, just not shown
    useStudio.getState().toggleRenderTime() // show again
    expect(useStudio.getState().items[0]!.renderTime).toBe('1h 12m')
  })

  it('is gone once the item is removed, and never comes back for a new item with the same slot', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    const id = ids()[0]!
    useStudio.getState().setRenderTime(id, '45s')
    useStudio.getState().removeItem(id)
    useStudio.getState().addFiles([fakeFile('a.mp4')]) // a fresh item, new id
    expect(useStudio.getState().items[0]!.renderTime).toBe('')
  })

  it('setting a value on a missing id is a harmless no-op', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    expect(() => useStudio.getState().setRenderTime('does-not-exist', '5s')).not.toThrow()
    expect(useStudio.getState().items[0]!.renderTime).toBe('')
  })
})

describe('drawing', () => {
  const stroke = (id: string, color = '#ffffff'): Stroke => ({
    id,
    color,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ],
  })

  it('starts empty, off, and on the app accent colour', () => {
    expect(useStudio.getState().strokes).toEqual([])
    expect(useStudio.getState().drawMode).toBe(false)
    expect(useStudio.getState().drawColor).toBe(DEFAULT_PEN_COLOR)
  })

  it('toggles pen mode, and turning it on turns off marquee-zoom mode', () => {
    useStudio.getState().toggleZoomMode()
    expect(useStudio.getState().zoomMode).toBe(true)
    useStudio.getState().toggleDrawMode()
    expect(useStudio.getState().drawMode).toBe(true)
    expect(useStudio.getState().zoomMode).toBe(false)
    useStudio.getState().setDrawMode(false)
    expect(useStudio.getState().drawMode).toBe(false)
  })

  it('changes the pen colour for strokes drawn from now on', () => {
    useStudio.getState().setDrawColor('#22d3ee')
    expect(useStudio.getState().drawColor).toBe('#22d3ee')
  })

  it('appends strokes in drawing order', () => {
    useStudio.getState().addStroke(stroke('s1'))
    useStudio.getState().addStroke(stroke('s2'))
    expect(useStudio.getState().strokes.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('retires the oldest stroke once the cap is exceeded, rather than growing unbounded', () => {
    for (let i = 0; i < MAX_STROKES + 5; i++) useStudio.getState().addStroke(stroke(`s${i}`))
    const ids = useStudio.getState().strokes.map((s) => s.id)
    expect(ids).toHaveLength(MAX_STROKES)
    expect(ids[0]).toBe('s5') // the first 5 quietly retired
    expect(ids[ids.length - 1]).toBe(`s${MAX_STROKES + 4}`)
  })

  it('clears every stroke at once', () => {
    useStudio.getState().addStroke(stroke('s1'))
    useStudio.getState().addStroke(stroke('s2'))
    useStudio.getState().clearStrokes()
    expect(useStudio.getState().strokes).toEqual([])
  })

  it('clearing all panels also clears the drawings on top of them', () => {
    useStudio.getState().addFiles([fakeFile('a.mp4')])
    useStudio.getState().addStroke(stroke('s1'))
    useStudio.getState().clearAll()
    expect(useStudio.getState().strokes).toEqual([])
  })
})
