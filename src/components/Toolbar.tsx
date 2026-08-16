import { useCallback, useRef, useState } from 'react'
import { useStudio } from '../store/useStudio'
import { ASPECT_OPTIONS } from '../lib/layout'
import { ACCEPT_ATTRIBUTE, MAX_PANELS } from '../lib/guards'
import { zoomFactor } from '../lib/zoom'
import {
  FullscreenIcon,
  GridIcon,
  HelpIcon,
  InfoIcon,
  PenIcon,
  PlusIcon,
  ResetIcon,
  RowIcon,
  StopwatchIcon,
  TrashIcon,
  ZoomIcon,
} from './Icons'
import { CoffeeLink } from './CoffeeLink'
import { Dropdown, type DropdownOption } from './Dropdown'
import { GridSizeControl } from './GridSizeControl'
import { PenColorPicker } from './PenColorPicker'
import type { AspectKey, FitMode, LayoutMode } from '../types'

const ASPECT_RATIO_OPTIONS: DropdownOption<AspectKey>[] = ASPECT_OPTIONS.map((option) => ({
  value: option.key,
  label: option.label,
  hint: option.key === 'free' ? 'Own ratio' : undefined,
  title:
    option.key === 'free'
      ? 'Each panel follows its own media ratio'
      : `Lock every panel to ${option.label}`,
}))

const LAYOUT_OPTIONS: {
  key: LayoutMode
  label: string
  title: string
  Icon: typeof RowIcon
}[] = [
  {
    key: 'row',
    label: 'Row',
    title: 'Keep every panel side by side on one line (G)',
    Icon: RowIcon,
  },
  {
    key: 'grid',
    label: 'Grid',
    title: 'Wrap the panels into a grid so each one keeps more height (G)',
    Icon: GridIcon,
  },
]

export function Toolbar({ onHelp }: { onHelp: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const penButtonRef = useRef<HTMLButtonElement>(null)
  const items = useStudio((state) => state.items)
  const aspect = useStudio((state) => state.aspect)
  const fitMode = useStudio((state) => state.fitMode)
  const layout = useStudio((state) => state.layout)
  const resolvedColumns = useStudio((state) => state.resolvedColumns)
  const fitColumns = useStudio((state) => state.fitColumns)
  const zoom = useStudio((state) => state.zoom)
  const zoomMode = useStudio((state) => state.zoomMode)
  const showInfo = useStudio((state) => state.showInfo)
  const showRenderTime = useStudio((state) => state.showRenderTime)
  const drawMode = useStudio((state) => state.drawMode)
  const drawColor = useStudio((state) => state.drawColor)
  const strokeCount = useStudio((state) => state.strokes.length)
  const addFiles = useStudio((state) => state.addFiles)
  const clearAll = useStudio((state) => state.clearAll)
  const setAspect = useStudio((state) => state.setAspect)
  const setFitMode = useStudio((state) => state.setFitMode)
  const setLayout = useStudio((state) => state.setLayout)
  const setColumns = useStudio((state) => state.setColumns)
  const toggleZoomMode = useStudio((state) => state.toggleZoomMode)
  const resetZoom = useStudio((state) => state.resetZoom)
  const toggleInfo = useStudio((state) => state.toggleInfo)
  const toggleRenderTime = useStudio((state) => state.toggleRenderTime)
  const toggleDrawMode = useStudio((state) => state.toggleDrawMode)
  const setDrawColor = useStudio((state) => state.setDrawColor)
  const clearStrokes = useStudio((state) => state.clearStrokes)

  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files && files.length > 0) addFiles(Array.from(files))
      // Reset so picking the same file twice still fires a change event.
      event.target.value = ''
    },
    [addFiles],
  )

  const onFullscreen = useCallback(() => {
    const root = document.documentElement
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.requestFullscreen?.().catch(() => undefined)
  }, [])

  const magnification = zoomFactor(zoom)
  const full = items.length >= MAX_PANELS

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <span className="brand__text">
          <strong>ABCvers Studio</strong>
          <small>Geekatplay Studio &middot; Vladimir Chopine</small>
        </span>
      </div>

      <div className="toolbar__group">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="visually-hidden"
          onChange={onPick}
          data-testid="file-input"
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => inputRef.current?.click()}
          disabled={full}
          title={full ? `Panel limit reached (${MAX_PANELS})` : 'Add videos or images'}
        >
          <PlusIcon size={15} />
          Add media
        </button>
        <button
          type="button"
          className="btn"
          onClick={clearAll}
          disabled={items.length === 0}
          title="Remove every panel"
        >
          <TrashIcon size={15} />
          Clear
        </button>
        <span className="counter" title="Open panels">
          {items.length}/{MAX_PANELS}
        </span>
      </div>

      {/* Aspect and fit are one decision - the shape of a panel and what the
          picture does inside that shape - so they share a group and a label. */}
      <div className="toolbar__group" aria-label="Panel shape">
        <span className="toolbar__label">Aspect</span>
        {/* Eight mutually exclusive ratios as eight buttons was the widest
            block in the toolbar, and seven of them are set once and left. A
            menu costs one click and gives back most of that width. */}
        <Dropdown
          label="Aspect ratio"
          title="Free follows each panel's own media ratio; anything else locks every panel to that shape"
          value={aspect}
          options={ASPECT_RATIO_OPTIONS}
          onChange={setAspect}
          width={68}
          testId="aspect"
        />

        <div className="segmented" role="group" aria-label="Picture fit">
          {(['fit', 'fill'] as FitMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className="segmented__item"
              aria-pressed={fitMode === mode}
              onClick={() => setFitMode(mode)}
              title={
                mode === 'fit'
                  ? 'Show the whole frame, letterboxing if the panel is a different shape'
                  : 'Crop the picture so it reaches every edge of the panel'
              }
            >
              {mode === 'fit' ? 'Fit' : 'Fill'}
            </button>
          ))}
        </div>
      </div>

      {/* Layout and grid size are one group: the row/grid choice, and - only
          when it can do anything - how wide that grid is. The slider replaced a
          seven-button Auto/1-6 strip, which is most of what this toolbar has
          bought back in width. */}
      <div className="toolbar__group" aria-label="Panel layout">
        <span className="toolbar__label">Layout</span>
        <div className="segmented" role="group" aria-label="Row or grid">
          {LAYOUT_OPTIONS.map(({ key, label, title, Icon }) => (
            <button
              key={key}
              type="button"
              className="segmented__item segmented__item--icon"
              aria-pressed={layout === key}
              onClick={() => setLayout(key)}
              disabled={items.length === 0}
              title={title}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        {layout === 'grid' && (
          <GridSizeControl
            columns={resolvedColumns}
            count={items.length}
            fitColumns={fitColumns}
            onColumns={setColumns}
          />
        )}
      </div>

      {/* Every control in this group is a view toggle, so they are all
          icon-only - a couple of them carrying words made the row read as two
          different kinds of control and cost most of a hundred pixels. */}
      <div className="toolbar__group toolbar__group--end">
        <button
          type="button"
          className="btn btn--icon"
          aria-pressed={zoomMode}
          onClick={toggleZoomMode}
          disabled={items.length === 0}
          title="Zoom: draw a marquee to magnify that area in every panel (Z)"
          aria-label="Zoom marquee mode"
        >
          <ZoomIcon size={15} />
        </button>
        {/* 1.0x is the resting state and says nothing; only a real
            magnification is worth the width. */}
        {magnification !== 1 && (
          <span className="counter" title="Current magnification">
            {magnification.toFixed(1)}x
          </span>
        )}
        <button
          type="button"
          className="btn btn--icon"
          onClick={resetZoom}
          disabled={magnification === 1}
          title="Reset to original framing (R)"
          aria-label="Reset zoom"
        >
          <ResetIcon size={15} />
        </button>
        <div className="pen-anchor">
          <button
            ref={penButtonRef}
            type="button"
            className="btn btn--icon"
            aria-pressed={drawMode}
            onClick={toggleDrawMode}
            onContextMenu={(event) => {
              event.preventDefault()
              setColorPickerOpen(true)
            }}
            disabled={items.length === 0}
            title="Pen: draw over any panel to point something out (P) - right-click for colour"
            aria-label="Pen"
            style={{ '--pen-color': drawColor } as React.CSSProperties}
          >
            <PenIcon size={15} />
            <span className="pen-swatch" aria-hidden="true" />
          </button>
          {colorPickerOpen && (
            <PenColorPicker
              color={drawColor}
              anchorRef={penButtonRef}
              onSelect={setDrawColor}
              onClose={() => setColorPickerOpen(false)}
            />
          )}
        </div>
        <button
          type="button"
          className="btn btn--icon"
          onClick={clearStrokes}
          disabled={strokeCount === 0}
          title="Clear every drawing"
          aria-label="Clear every drawing"
        >
          <TrashIcon size={15} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-pressed={showInfo}
          onClick={toggleInfo}
          title="Toggle the media info strips (I)"
          aria-label="Toggle media info"
        >
          <InfoIcon size={15} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-pressed={showRenderTime}
          onClick={toggleRenderTime}
          title="Show editable render-time boxes on every panel (T)"
          aria-label="Toggle render time boxes"
        >
          <StopwatchIcon size={15} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          onClick={onFullscreen}
          title="Fullscreen (F)"
          aria-label="Toggle fullscreen"
        >
          <FullscreenIcon size={15} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          onClick={onHelp}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <HelpIcon size={15} />
        </button>
        <CoffeeLink />
      </div>
    </header>
  )
}
