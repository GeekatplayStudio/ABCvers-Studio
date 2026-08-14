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

const TYPE_LABEL: Record<'exr' | 'dng', string> = {
  exr: 'OpenEXR (HDR)',
  dng: 'DNG (RAW preview)',
}

/** The metadata strip printed under every panel. */
export const MediaInfo = memo(function MediaInfo({ item }: { item: MediaItem }) {
  const meta = item.meta
  const isVideo = item.kind === 'video'
  const megapixels = meta && meta.width && meta.height ? (meta.width * meta.height) / 1e6 : 0
  const hasSensorSize =
    meta?.sensorWidth && meta?.sensorHeight && (meta.sensorWidth !== meta.width || meta.sensorHeight !== meta.height)
  const typeLabel =
    item.imageDecoder === 'exr' || item.imageDecoder === 'dng' ? TYPE_LABEL[item.imageDecoder] : item.mimeType || '--'

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
      {hasSensorSize && (
        <Field
          label="Sensor"
          value={formatResolution(meta!.sensorWidth!, meta!.sensorHeight!)}
          title="True capture resolution - the picture shown is the DNG's embedded preview, not the full RAW"
        />
      )}
      <Field label="Size" value={formatBytes(item.size)} />
      <Field label="Type" value={typeLabel} />
      <Field label="Modified" value={formatDate(item.lastModified)} />
      {item.status === 'error' && <Field label="Error" value={item.error ?? 'Failed to decode'} wide />}
    </dl>
  )
})
