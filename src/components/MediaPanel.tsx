import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { MediaItem } from '../types'
import { effectiveVolume, useStudio } from '../store/useStudio'
import { syncEngine } from '../lib/sync'
import { aspectOf, loadDngPreview, loadExr, metaFromImage, metaFromVideo, primeFps } from '../lib/media'
import { tonemapToImageData, type DecodedExr } from '../lib/exr'
import { MediaSurface } from './MediaSurface'
import { MediaInfo } from './MediaInfo'
import { Scrubber } from './Scrubber'
import { VolumeControl } from './VolumeControl'
import { ExposureControl } from './ExposureControl'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  StepBackIcon,
  StepForwardIcon,
} from './Icons'
import { middleTruncate } from '../lib/format'

interface MediaPanelProps {
  item: MediaItem
  index: number
  total: number
  /** Exact picture height from the row fit, or null before it is measured. */
  mediaHeight: number | null
  /** Lets the row measure the strips it has to reserve space for. */
  footerRef: (element: HTMLElement | null) => void
}

export const MediaPanel = memo(function MediaPanel({
  item,
  index,
  total,
  mediaHeight,
  footerRef,
}: MediaPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const showInfo = useStudio((state) => state.showInfo)
  const showOverlayName = useStudio((state) => state.showOverlayName)
  const globalVolume = useStudio((state) => state.globalVolume)
  const globalMuted = useStudio((state) => state.globalMuted)
  const removeItem = useStudio((state) => state.removeItem)
  const moveItem = useStudio((state) => state.moveItem)
  const setMeta = useStudio((state) => state.setMeta)
  const setFps = useStudio((state) => state.setFps)
  const setStatus = useStudio((state) => state.setStatus)
  const setItemVolume = useStudio((state) => state.setItemVolume)
  const toggleItemMute = useStudio((state) => state.toggleItemMute)
  const soloItem = useStudio((state) => state.soloItem)
  const setExposure = useStudio((state) => state.setExposure)

  const isVideo = item.kind === 'video'
  const isExr = item.imageDecoder === 'exr'
  const isDng = item.imageDecoder === 'dng'
  const aspect = aspectOf(item)
  const duration = item.meta?.duration ?? 0

  // ---- audio: push the resolved level straight onto the element -----------
  const level = effectiveVolume(item, globalVolume, globalMuted)
  const levelRef = useRef(level)
  levelRef.current = level
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = level
    // Keeping `muted` in sync too lets the browser skip decoding audio at 0.
    video.muted = level === 0
  }, [level])

  // Guards the async fps probe below against acting on a panel that has
  // already closed - `primeFps` can still be mid-flight after that happens.
  const aliveRef = useRef(true)
  useEffect(() => () => {
    aliveRef.current = false
  }, [])

  // ---- registration with the sync engine ---------------------------------
  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setMeta(item.id, metaFromVideo(video))

    // Measuring fps needs real presented frames, which a freshly loaded,
    // still-paused clip does not have - so this briefly (and silently, muted)
    // plays the clip to get them, then rewinds. Registration is deliberately
    // deferred until that finishes: the sync engine corrects every follower
    // toward the master on every animation frame regardless of play state, so
    // registering first would have it fight the priming playback back to the
    // master's position on the very next frame, starving the probe of the
    // frame-to-frame gaps it needs.
    void primeFps(video).then((fps) => {
      if (!aliveRef.current || videoRef.current !== video) return
      // The priming play forces `muted` for browser autoplay policy and
      // restores whatever it found - reassert the panel's actual, possibly
      // since-changed, volume choice rather than trust that snapshot.
      video.muted = levelRef.current === 0
      setFps(item.id, fps)
      syncEngine.register(item.id, video, fps)
    })
  }, [item.id, setFps, setMeta])

  useEffect(() => {
    if (!isVideo) return
    const id = item.id
    return () => syncEngine.unregister(id)
  }, [isVideo, item.id])

  const onError = useCallback(() => {
    setStatus(item.id, 'error', 'This file could not be decoded by the browser')
  }, [item.id, setStatus])

  const onImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setMeta(item.id, metaFromImage(event.currentTarget))
    },
    [item.id, setMeta],
  )

  // ---- EXR: decode once per file, then just re-tonemap on exposure changes -
  const [exrDecoded, setExrDecoded] = useState<DecodedExr | null>(null)
  useEffect(() => {
    if (!isExr) return
    let cancelled = false
    setExrDecoded(null)
    loadExr(item.url)
      .then((decoded) => {
        if (cancelled) return
        setExrDecoded(decoded)
        setMeta(item.id, { width: decoded.width, height: decoded.height, duration: 0, fps: 0 })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus(item.id, 'error', error instanceof Error ? error.message : 'Could not decode this EXR')
      })
    return () => {
      cancelled = true
    }
  }, [isExr, item.id, item.url, setMeta, setStatus])

  // Redraws whenever the decoded data or the exposure slider changes -
  // cheap, since it is only re-tonemapping already-decoded floats, not
  // re-parsing the file.
  useEffect(() => {
    if (!isExr || !exrDecoded) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = exrDecoded.width
    canvas.height = exrDecoded.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(tonemapToImageData(exrDecoded, item.exposure), 0, 0)
  }, [isExr, exrDecoded, item.exposure])

  // ---- DNG: extract the embedded preview JPEG and point a plain <img> at it
  const [dngPreviewUrl, setDngPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!isDng) return
    let cancelled = false
    let createdUrl: string | null = null
    setDngPreviewUrl(null)
    loadDngPreview(item.url)
      .then((preview) => {
        if (cancelled) {
          URL.revokeObjectURL(preview.previewUrl)
          return
        }
        createdUrl = preview.previewUrl
        setDngPreviewUrl(preview.previewUrl)
        setMeta(item.id, {
          width: preview.previewWidth,
          height: preview.previewHeight,
          duration: 0,
          fps: 0,
          sensorWidth: preview.sensorWidth,
          sensorHeight: preview.sensorHeight,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus(item.id, 'error', error instanceof Error ? error.message : 'Could not read this DNG')
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [isDng, item.id, item.url, setMeta, setStatus])

  const bindScrubber = useCallback(
    (setTime: (time: number) => void) => syncEngine.subscribe((time) => setTime(time)),
    [],
  )

  const onSeek = useCallback((time: number) => syncEngine.seek(time), [])

  const onMuteClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.altKey) soloItem(item.id)
      else toggleItemMute(item.id)
    },
    [item.id, soloItem, toggleItemMute],
  )

  return (
    <section className="panel" data-kind={item.kind} data-status={item.status} aria-label={item.name}>
      <div
        className="panel__stage"
        style={mediaHeight === null ? undefined : { height: `${mediaHeight}px`, flex: '0 0 auto' }}
      >
        <MediaSurface
          aspect={aspect}
          overlay={
            <>
              {showOverlayName && (
                <div className="panel__badge" title={item.name}>
                  <span className="panel__index">{index + 1}</span>
                  <span className="panel__title">{middleTruncate(item.name, 26)}</span>
                </div>
              )}
              {item.status === 'error' && (
                <div className="panel__error" role="alert">
                  {item.error ?? 'Failed to load'}
                </div>
              )}
            </>
          }
        >
          {isVideo ? (
            <video
              ref={videoRef}
              className="panel__media"
              src={item.url}
              playsInline
              preload="auto"
              muted={level === 0}
              onLoadedMetadata={onLoadedMetadata}
              onError={onError}
              data-testid={`video-${item.id}`}
            />
          ) : isExr ? (
            // No <img> involved: this is decoded and tone-mapped by hand in
            // lib/exr.ts, since no browser can open an EXR file itself.
            <canvas
              ref={canvasRef}
              className="panel__media"
              role="img"
              aria-label={item.name}
              data-testid={`exr-${item.id}`}
            />
          ) : isDng ? (
            // Never the raw DNG bytes - `dngPreviewUrl` is the embedded JPEG
            // preview lib/dng.ts found and extracted, which is all any
            // browser can actually display without a full RAW pipeline.
            dngPreviewUrl && (
              <img
                className="panel__media"
                src={dngPreviewUrl}
                alt={item.name}
                draggable={false}
                onError={onError}
                data-testid={`dng-${item.id}`}
              />
            )
          ) : (
            <img
              className="panel__media"
              src={item.url}
              alt={item.name}
              draggable={false}
              onLoad={onImageLoad}
              onError={onError}
              data-testid={`image-${item.id}`}
            />
          )}
        </MediaSurface>

        <div className="panel__tools">
          <button
            type="button"
            className="iconbtn"
            onClick={() => moveItem(item.id, -1)}
            disabled={index === 0}
            aria-label={`Move ${item.name} left`}
            title="Move left"
          >
            <ArrowLeftIcon size={14} />
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={() => moveItem(item.id, 1)}
            disabled={index === total - 1}
            aria-label={`Move ${item.name} right`}
            title="Move right"
          >
            <ArrowRightIcon size={14} />
          </button>
          <button
            type="button"
            className="iconbtn iconbtn--danger"
            onClick={() => removeItem(item.id)}
            aria-label={`Close ${item.name}`}
            title="Close panel"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>

      <div className="panel__footer" ref={footerRef}>
        <div className="panel__transport">
          {isVideo ? (
            <>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                onClick={() => syncEngine.step(-1)}
                aria-label={`Previous frame, from ${item.name}`}
                title="Previous frame - moves every panel"
              >
                <StepBackIcon size={13} />
              </button>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                onClick={() => syncEngine.step(1)}
                aria-label={`Next frame, from ${item.name}`}
                title="Next frame - moves every panel"
              >
                <StepForwardIcon size={13} />
              </button>
              <Scrubber
                duration={duration}
                bind={bindScrubber}
                onSeek={onSeek}
                label={`${item.name} position`}
                compact
              />
            </>
          ) : isExr ? (
            <ExposureControl
              value={item.exposure}
              onChange={(stops) => setExposure(item.id, stops)}
              label={item.name}
              compact
            />
          ) : isDng ? (
            <div className="panel__still" title={`Sensor: ${item.meta?.sensorWidth ?? '?'} x ${item.meta?.sensorHeight ?? '?'}`}>
              RAW preview
            </div>
          ) : (
            <div className="panel__still">still image</div>
          )}
          <VolumeControl
            volume={item.volume}
            muted={item.muted || globalMuted}
            onVolume={(value) => setItemVolume(item.id, value)}
            onToggleMute={onMuteClick}
            label={item.name}
            compact
            disabled={!isVideo}
          />
        </div>

        {showInfo && <MediaInfo item={item} />}
      </div>
    </section>
  )
})
