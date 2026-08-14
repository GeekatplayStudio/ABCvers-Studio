import { useCallback, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Stage } from './components/Stage'
import { DrawingLayer } from './components/DrawingLayer'
import { TransportBar } from './components/TransportBar'
import { EmptyState } from './components/EmptyState'
import { Toasts } from './components/Toasts'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { useStudio } from './store/useStudio'
import { useDropTarget } from './hooks/useDropTarget'
import { useShortcuts } from './hooks/useShortcuts'

export default function App() {
  const items = useStudio((state) => state.items)
  const zoomMode = useStudio((state) => state.zoomMode)
  const addFiles = useStudio((state) => state.addFiles)
  const [helpOpen, setHelpOpen] = useState(false)

  const onFiles = useCallback((files: File[]) => addFiles(files), [addFiles])
  const { dragging } = useDropTarget(onFiles)
  const openHelp = useCallback(() => setHelpOpen(true), [])
  useShortcuts(openHelp)

  return (
    <div className="app" data-dragging={dragging || undefined} data-zoommode={zoomMode || undefined}>
      <Toolbar onHelp={openHelp} />

      <main className="app__main">
        <ErrorBoundary>{items.length === 0 ? <EmptyState /> : <Stage />}</ErrorBoundary>
        {items.length > 0 && <DrawingLayer />}
      </main>

      <TransportBar />

      {dragging && (
        <div className="dropveil" aria-hidden="true">
          <div className="dropveil__inner">Drop to add {items.length > 0 ? 'more ' : ''}media</div>
        </div>
      )}

      <Toasts />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
