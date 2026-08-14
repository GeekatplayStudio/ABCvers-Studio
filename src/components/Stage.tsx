import { useCallback, useMemo, useRef } from 'react'
import { useStudio } from '../store/useStudio'
import { chunkRows, fitRow, panelWeight, resolveColumns } from '../lib/layout'
import { useElementSize } from '../hooks/useElementSize'
import { useMaxHeight } from '../hooks/useMaxHeight'
import { MediaPanel } from './MediaPanel'
import type { MediaItem, Size } from '../types'

/** Draggable divider that trades width between two neighbouring panels. */
function Splitter({
  leftId,
  rightId,
  rowWidth,
}: {
  leftId: string
  rightId: string
  rowWidth: number
}) {
  const resizeSplit = useStudio((state) => state.resizeSplit)
  const last = useRef<number | null>(null)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    last.current = event.clientX
    document.body.classList.add('is-resizing')
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (last.current === null || rowWidth <= 0) return
    const delta = event.clientX - last.current
    last.current = event.clientX
    resizeSplit(leftId, rightId, delta / rowWidth)
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    last.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.classList.remove('is-resizing')
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      resizeSplit(leftId, rightId, -step)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      resizeSplit(leftId, rightId, step)
    }
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
    >
      <span className="splitter__grip" />
    </div>
  )
}

interface RowProps {
  items: MediaItem[]
  offset: number
  total: number
  /** Space this row may occupy. */
  box: Size
}

/**
 * One row of panels, justified so the pictures touch.
 *
 * Every panel is given the same picture height and a width of
 * `height * aspect`, which makes each box exactly the shape of the picture
 * inside it. No letterbox bars, so neighbouring pictures meet edge to edge.
 */
function Row({ items, offset, total, box }: RowProps) {
  const aspect = useStudio((state) => state.aspect)
  const [registerFooter, footerHeight] = useMaxHeight()

  const weights = useMemo(() => items.map((item) => panelWeight(item, aspect)), [items, aspect])
  const fit = useMemo(() => fitRow(weights, box, footerHeight), [weights, box, footerHeight])

  // Before the first measurement (and in non-visual environments) fall back to
  // proportional flex so panels still render at a sensible size.
  const measured = fit.mediaHeight > 0
  const rowWidth = measured ? fit.widths.reduce((sum, width) => sum + width, 0) : box.width

  return (
    <div className="row" data-measured={measured || undefined}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className="row__cell"
          style={
            measured
              ? { width: `${fit.widths[index] ?? 0}px`, flex: '0 0 auto' }
              : { flexGrow: weights[index], flexBasis: 0 }
          }
        >
          <MediaPanel
            item={item}
            index={offset + index}
            total={total}
            mediaHeight={measured ? fit.mediaHeight : null}
            footerRef={registerFooter(item.id)}
          />
          {index < items.length - 1 && (
            <Splitter leftId={item.id} rightId={items[index + 1]!.id} rowWidth={rowWidth} />
          )}
        </div>
      ))}
    </div>
  )
}

/** The main comparison area: rows of panels, no gaps between screens. */
export function Stage() {
  const items = useStudio((state) => state.items)
  const columns = useStudio((state) => state.columns)
  const aspect = useStudio((state) => state.aspect)
  const [stageRef, stageSize] = useElementSize<HTMLDivElement>()

  const resolved = resolveColumns(items.length, columns)
  const rows = useMemo(() => chunkRows(items, resolved), [items, resolved])

  // Rows split the stage evenly; each one then justifies its own panels.
  const rowBox = useMemo<Size>(
    () => ({
      width: stageSize.width,
      height: rows.length > 0 ? stageSize.height / rows.length : stageSize.height,
    }),
    [stageSize, rows.length],
  )

  const onContextMenu = useCallback((event: React.MouseEvent) => {
    // Right-click inside a panel would otherwise open the native video menu.
    if ((event.target as HTMLElement).closest('.surface')) event.preventDefault()
  }, [])

  return (
    <div
      className="stage"
      ref={stageRef}
      data-locked={aspect === 'free' ? undefined : 'true'}
      data-count={items.length}
      onContextMenu={onContextMenu}
    >
      {rows.map((row, rowIndex) => (
        <Row
          key={row.map((item) => item.id).join('|')}
          items={row}
          offset={rowIndex * resolved}
          total={items.length}
          box={rowBox}
        />
      ))}
    </div>
  )
}
