import { useCallback, useRef } from 'react'
import { useStudio } from '../store/useStudio'
import { ASPECT_OPTIONS } from '../lib/layout'
import { ACCEPT_ATTRIBUTE, MAX_PANELS } from '../lib/guards'
import { zoomFactor } from '../lib/zoom'
import {
  FullscreenIcon,
  HelpIcon,
  InfoIcon,
  PlusIcon,
  ResetIcon,
  TrashIcon,
  ZoomIcon,
} from './Icons'
import { CoffeeLink } from './CoffeeLink'
import type { AspectKey, FitMode } from '../types'

const COLUMN_OPTIONS: (number | 'auto')[] = ['auto', 1, 2, 3, 4, 5, 6]

export function Toolbar({ onHelp }: { onHelp: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const items = useStudio((state) => state.items)
  const aspect = useStudio((state) => state.aspect)
  const fitMode = useStudio((state) => state.fitMode)
  const columns = useStudio((state) => state.columns)
  const zoom = useStudio((state) => state.zoom)
  const zoomMode = useStudio((state) => state.zoomMode)
  const showInfo = useStudio((state) => state.showInfo)
  const addFiles = useStudio((state) => state.addFiles)
  const clearAll = useStudio((state) => state.clearAll)
  const setAspect = useStudio((state) => state.setAspect)
  const setFitMode = useStudio((state) => state.setFitMode)
  const setColumns = useStudio((state) => state.setColumns)
  const toggleZoomMode = useStudio((state) => state.toggleZoomMode)
  const resetZoom = useStudio((state) => state.resetZoom)
  const toggleInfo = useStudio((state) => state.toggleInfo)

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

      <div className="toolbar__group" role="group" aria-label="Aspect ratio">
        <span className="toolbar__label">Aspect</span>
        <div className="segmented">
          {ASPECT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className="segmented__item"
              aria-pressed={aspect === option.key}
              onClick={() => setAspect(option.key as AspectKey)}
              title={option.key === 'free' ? 'Each panel follows its own media ratio' : `Lock every panel to ${option.label}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar__group" role="group" aria-label="Picture fit">
        <span className="toolbar__label">Fit</span>
        <div className="segmented">
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

      <div className="toolbar__group" role="group" aria-label="Columns">
        <span className="toolbar__label">Screens</span>
        <div className="segmented">
          {COLUMN_OPTIONS.map((option) => (
            <button
              key={String(option)}
              type="button"
              className="segmented__item"
              aria-pressed={columns === option}
              onClick={() => setColumns(option)}
              title={option === 'auto' ? 'Choose the column count automatically' : `${option} per row`}
            >
              {option === 'auto' ? 'Auto' : option}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar__group toolbar__group--end">
        <button
          type="button"
          className="btn"
          aria-pressed={zoomMode}
          onClick={toggleZoomMode}
          disabled={items.length === 0}
          title="Draw a marquee to magnify that area in every panel (Z)"
        >
          <ZoomIcon size={15} />
          Zoom
        </button>
        <span className="counter" title="Current magnification">
          {magnification.toFixed(1)}x
        </span>
        <button
          type="button"
          className="btn"
          onClick={resetZoom}
          disabled={magnification === 1}
          title="Reset to original framing (R)"
        >
          <ResetIcon size={15} />
          Reset
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
