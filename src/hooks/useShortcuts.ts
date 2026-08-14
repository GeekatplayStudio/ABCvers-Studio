import { useEffect } from 'react'
import { FRAME_JUMP, syncEngine } from '../lib/sync'
import { useStudio } from '../store/useStudio'

/** True when the user is typing or working a slider - shortcuts stand down. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || !element.tagName) return false
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (element.isContentEditable) return true
  return element.getAttribute('role') === 'slider'
}

export function useShortcuts(onHelp: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      const store = useStudio.getState()
      const key = event.key

      switch (key) {
        case ' ':
        case 'k':
          event.preventDefault()
          syncEngine.toggle()
          return
        // NLE-standard jog keys, so frame stepping is reachable without
        // taking your hand off the letter keys.
        case ',':
          event.preventDefault()
          syncEngine.step(-1)
          return
        case '.':
          event.preventDefault()
          syncEngine.step(1)
          return
        case '<':
          event.preventDefault()
          syncEngine.step(-FRAME_JUMP)
          return
        case '>':
          event.preventDefault()
          syncEngine.step(FRAME_JUMP)
          return
        case 'ArrowLeft':
          event.preventDefault()
          if (event.shiftKey) syncEngine.seekBy(-1)
          else syncEngine.step(-1)
          return
        case 'ArrowRight':
          event.preventDefault()
          if (event.shiftKey) syncEngine.seekBy(1)
          else syncEngine.step(1)
          return
        case 'Home':
          event.preventDefault()
          syncEngine.seek(0)
          return
        case 'End':
          event.preventDefault()
          syncEngine.seek(syncEngine.duration)
          return
        case 'Escape':
          if (store.zoomMode) store.setZoomMode(false)
          return
      }

      switch (key.toLowerCase()) {
        case 'z':
          store.toggleZoomMode()
          break
        case 'r':
          store.resetZoom()
          break
        case 'm':
          store.toggleGlobalMute()
          break
        case 'l':
          store.setLoop(!store.loop)
          break
        case 'i':
          store.toggleInfo()
          break
        case 'n':
          store.toggleOverlayName()
          break
        case 'f':
          if (document.fullscreenElement) void document.exitFullscreen()
          else void document.documentElement.requestFullscreen?.().catch(() => undefined)
          break
        case '+':
        case '=':
          store.zoomBy(1.25)
          break
        case '-':
        case '_':
          store.zoomBy(1 / 1.25)
          break
        case '?':
          onHelp()
          break
        case '0':
          store.setColumns('auto')
          break
        default:
          if (/^[1-6]$/.test(key)) store.setColumns(Number(key))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onHelp])
}
