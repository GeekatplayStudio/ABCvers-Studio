import { useEffect, useRef } from 'react'
import { CloseIcon } from './Icons'
import { COFFEE_URL } from './CoffeeLink'

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / pause every panel' },
  { keys: '← / →', action: 'Step one frame back / forward' },
  { keys: ', / .', action: 'Step one frame back / forward' },
  { keys: '< / >', action: 'Jog ten frames back / forward' },
  { keys: 'Shift + ← / →', action: 'Jump one second' },
  { keys: 'Home / End', action: 'Go to start / end' },
  { keys: 'L', action: 'Loop (on by default)' },
  { keys: 'Z', action: 'Zoom marquee mode' },
  { keys: 'R', action: 'Reset zoom' },
  { keys: 'P', action: 'Pen (draw over every panel)' },
  { keys: 'Right-click Pen', action: 'Choose a pen colour' },
  { keys: 'Esc', action: 'Leave marquee/pen mode' },
  { keys: '+ / -', action: 'Zoom in / out' },
  { keys: 'Ctrl + wheel', action: 'Zoom around the cursor' },
  { keys: 'Drag (while zoomed)', action: 'Pan all panels together' },
  { keys: 'M', action: 'Global mute' },
  { keys: 'Alt + click speaker', action: 'Solo that panel' },
  { keys: 'I', action: 'Toggle info strips' },
  { keys: 'N', action: 'Toggle name overlays' },
  { keys: 'T', action: 'Toggle render-time boxes' },
  { keys: 'F', action: 'Fullscreen' },
  { keys: 'G', action: 'Switch between row and grid layout' },
  { keys: '[ / ]', action: 'Smaller / larger panels in a grid' },
  { keys: '0', action: 'Automatic panel size' },
  { keys: '?', action: 'This panel' },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="modal__scrim" onClick={onClose} />
      <div className="modal__card">
        <div className="modal__head">
          <h2>Keyboard shortcuts</h2>
          <button ref={closeRef} type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>
        <ul className="shortcuts">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys}>
              <kbd>{shortcut.keys}</kbd>
              <span>{shortcut.action}</span>
            </li>
          ))}
        </ul>
        <p className="modal__foot">
          ABCvers Studio &middot; Geekatplay Studio &middot; Vladimir Chopine
          <br />
          <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
            Say thanks with a coffee
          </a>
        </p>
      </div>
    </div>
  )
}
