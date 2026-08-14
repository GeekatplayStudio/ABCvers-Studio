import { memo, useCallback, useEffect, useRef } from 'react'
import type { MediaItem } from '../types'
import { effectiveVolume, useStudio } from '../store/useStudio'
import { syncEngine } from '../lib/sync'
import { aspectOf, metaFromImage, metaFromVideo, probeFps } from '../lib/media'
import { MediaSurface } from './MediaSurface'
import { MediaInfo } from './MediaInfo'
import { Scrubber } from './Scrubber'
import { VolumeControl } from './VolumeControl'
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

  const isVideo = item.kind === 'video'
  const aspect = aspectOf(item)
  const duration = item.meta?.duration ?? 0

  // ---- audio: push the resolved level straight onto the element -----------
  const level = effectiveVolume(item, globalVolume, globalMuted)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = level
    // Keeping `muted` in sync too lets the browser skip decoding audio at 0.
    video.muted = level === 0
  }, [level])

  // ---- registration with the sync engine ---------------------------------
  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const meta = metaFromVideo(video)
    setMeta(item.id, meta)
    syncEngine.register(item.id, video, meta.fps || undefined)
    void probeFps(video).then((fps) => {
      setFps(item.id, fps)
      syncEngine.setFps(item.id, fps)
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
