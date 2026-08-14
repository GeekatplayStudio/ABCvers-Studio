import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaInfo } from './MediaInfo'
import type { MediaItem } from '../types'

const video: MediaItem = {
  id: 'v1',
  name: 'hero-shot-final-v3.mp4',
  size: 1024 * 1024 * 250,
  mimeType: 'video/mp4',
  lastModified: new Date(2024, 4, 17, 9, 30).getTime(),
  kind: 'video',
  url: 'blob:v1',
  status: 'ready',
  meta: { width: 3840, height: 2160, duration: 64.5, fps: 25 },
  volume: 1,
  muted: false,
  weight: 1,
  imageDecoder: null,
  exposure: 0,
}

describe('MediaInfo', () => {
  it('shows the full video metadata set', () => {
    render(<MediaInfo item={video} />)
    expect(screen.getByText('3840 x 2160')).toBeInTheDocument()
    expect(screen.getByText('16:9')).toBeInTheDocument()
    expect(screen.getByText('1m 04s')).toBeInTheDocument()
    expect(screen.getByText('25 fps')).toBeInTheDocument()
    expect(screen.getByText('250.0 MB')).toBeInTheDocument()
    expect(screen.getByText('video/mp4')).toBeInTheDocument()
    expect(screen.getByText('1,613')).toBeInTheDocument() // frame count
  })

  it('keeps the full name available as a tooltip when truncated', () => {
    render(<MediaInfo item={video} />)
    expect(screen.getByTitle('hero-shot-final-v3.mp4')).toBeInTheDocument()
  })

  it('shows placeholders while metadata is still loading', () => {
    render(<MediaInfo item={{ ...video, meta: null, status: 'loading' }} />)
    expect(screen.getAllByText('--').length).toBeGreaterThan(2)
  })

  it('swaps duration fields for pixel count on stills', () => {
    render(
      <MediaInfo
        item={{
          ...video,
          id: 'i1',
          kind: 'image',
          name: 'plate.png',
          mimeType: 'image/png',
          meta: { width: 4000, height: 3000, duration: 0, fps: 0 },
        }}
      />,
    )
    expect(screen.getByText('12.00 MP')).toBeInTheDocument()
    expect(screen.queryByText('Frame rate')).not.toBeInTheDocument()
  })

  it('surfaces a decode error', () => {
    render(<MediaInfo item={{ ...video, status: 'error', error: 'unsupported codec' }} />)
    expect(screen.getByText('unsupported codec')).toBeInTheDocument()
  })

  it('labels an EXR panel by format rather than its unhelpful MIME type', () => {
    render(
      <MediaInfo
        item={{
          ...video,
          id: 'e1',
          kind: 'image',
          name: 'beauty.exr',
          mimeType: '',
          imageDecoder: 'exr',
          meta: { width: 1920, height: 1080, duration: 0, fps: 0 },
        }}
      />,
    )
    expect(screen.getByText('OpenEXR (HDR)')).toBeInTheDocument()
  })

  it('shows the true sensor size for a DNG whose preview is smaller than the sensor', () => {
    render(
      <MediaInfo
        item={{
          ...video,
          id: 'd1',
          kind: 'image',
          name: 'IMG_0142.dng',
          mimeType: '',
          imageDecoder: 'dng',
          meta: { width: 1616, height: 1080, duration: 0, fps: 0, sensorWidth: 6048, sensorHeight: 4032 },
        }}
      />,
    )
    expect(screen.getByText('DNG (RAW preview)')).toBeInTheDocument()
    expect(screen.getByText('Sensor')).toBeInTheDocument()
    expect(screen.getByText('6048 x 4032')).toBeInTheDocument()
    // and the resolution field still reports what is actually on screen, not the sensor
    expect(screen.getByText('1616 x 1080')).toBeInTheDocument()
  })

  it('hides the sensor field when the DNG preview already matches the sensor size', () => {
    render(
      <MediaInfo
        item={{
          ...video,
          id: 'd2',
          kind: 'image',
          name: 'full-res.dng',
          mimeType: '',
          imageDecoder: 'dng',
          meta: { width: 6048, height: 4032, duration: 0, fps: 0, sensorWidth: 6048, sensorHeight: 4032 },
        }}
      />,
    )
    expect(screen.queryByText('Sensor')).not.toBeInTheDocument()
  })
})
