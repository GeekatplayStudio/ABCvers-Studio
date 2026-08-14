import { memo } from 'react'
import type { MediaItem } from '../types'
import {
  aspectLabel,
  formatBytes,
  formatDate,
  formatDuration,
  formatResolution,
  middleTruncate,
} from '../lib/format'

interface FieldProps {
  label: string
  value: string
  title?: string
  wide?: boolean
}

function Field({ label, value, title, wide }: FieldProps) {
  return (
    <div className={`meta__field${wide ? ' meta__field--wide' : ''}`}>
      <span className="meta__label">{label}</span>
      <span className="meta__value" title={title ?? value}>
        {value}
      </span>
    </div>
  )
}

/** The metadata strip printed under every panel. */
export const MediaInfo = memo(function MediaInfo({ item }: { item: MediaItem }) {
  const meta = item.meta
  const isVideo = item.kind === 'video'
  const megapixels = meta && meta.width && meta.height ? (meta.width * meta.height) / 1e6 : 0

  return (
    <dl className="meta" data-testid={`meta-${item.id}`}>
      <Field label="Name" value={middleTruncate(item.name, 30)} title={item.name} wide />
      <Field
        label="Resolution"
        value={meta ? formatResolution(meta.width, meta.height) : '--'}
        title={megapixels ? `${megapixels.toFixed(2)} MP` : undefined}
      />
      <Field label="Aspect" value={meta ? aspectLabel(meta.width, meta.height) : '--'} />
      {isVideo ? (
        <>
          <Field label="Duration" value={meta ? formatDuration(meta.duration) : '--'} />
          <Field label="Frame rate" value={meta && meta.fps ? `${meta.fps} fps` : 'probing…'} />
          <Field
            label="Frames"
            value={meta && meta.fps && meta.duration ? Math.round(meta.duration * meta.fps).toLocaleString() : '--'}
          />
        </>
      ) : (
        <Field label="Pixels" value={megapixels ? `${megapixels.toFixed(2)} MP` : '--'} />
      )}
      <Field label="Size" value={formatBytes(item.size)} />
      <Field label="Type" value={item.mimeType || '--'} />
      <Field label="Modified" value={formatDate(item.lastModified)} />
      {item.status === 'error' && <Field label="Error" value={item.error ?? 'Failed to decode'} wide />}
    </dl>
  )
})
