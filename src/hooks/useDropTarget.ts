import { useCallback, useEffect, useRef, useState } from 'react'
import { filesFromDataTransfer } from '../lib/media'

/**
 * Window-wide drag & drop. Uses an enter/leave counter because dragleave fires
 * for every child element the cursor crosses - the naive version flickers.
 */
export function useDropTarget(onFiles: (files: File[]) => void): { dragging: boolean } {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const handler = useRef(onFiles)
  handler.current = onFiles

  const carriesFiles = useCallback((event: DragEvent): boolean => {
    const types = event.dataTransfer?.types
    if (!types) return false
    return Array.from(types).includes('Files')
  }, [])

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer) return
      event.preventDefault()
      depth.current = 0
      setDragging(false)
      void filesFromDataTransfer(event.dataTransfer).then((files) => {
        if (files.length > 0) handler.current(files)
      })
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [carriesFiles])

  return { dragging }
}
