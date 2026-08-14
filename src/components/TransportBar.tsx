import { useCallback, useEffect, useRef, useState } from 'react'
import { useStudio } from '../store/useStudio'
import { FRAME_JUMP, syncEngine } from '../lib/sync'
import { Scrubber } from './Scrubber'
import { VolumeControl } from './VolumeControl'
import {
  JumpBackIcon,
  JumpForwardIcon,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  StepBackIcon,
  StepForwardIcon,
  StopIcon,
} from './Icons'
import { CoffeeLink } from './CoffeeLink'
import { formatClock, formatTimecode } from '../lib/format'

const RATES = [0.25, 0.5, 1, 1.5, 2] as const

/** Master transport: one clock, one play button, one volume for every panel. */
export function TransportBar() {
  const items = useStudio((state) => state.items)
  const loop = useStudio((state) => state.loop)
  const setLoop = useStudio((state) => state.setLoop)
  const globalVolume = useStudio((state) => state.globalVolume)
  const globalMuted = useStudio((state) => state.globalMuted)
  const setGlobalVolume = useStudio((state) => state.setGlobalVolume)
  const toggleGlobalMute = useStudio((state) => state.toggleGlobalMute)

  const videoCount = items.filter((item) => item.kind === 'video').length
  const hasVideo = videoCount > 0

  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const timecodeRef = useRef<HTMLSpanElement>(null)
  const fpsRef = useRef(30)

  // Only two pieces of transport state can change identity; the playhead
  // itself is written straight into the DOM below.
  useEffect(
    () =>
      syncEngine.subscribe((time, engineDuration, isPlaying) => {
        setPlaying((previous) => (previous === isPlaying ? previous : isPlaying))
        setDuration((previous) => (Math.abs(previous - engineDuration) < 0.001 ? previous : engineDuration))
        fpsRef.current = syncEngine.masterFps
        const node = timecodeRef.current
        if (node) node.textContent = formatTimecode(time, fpsRef.current)
      }),
    [],
  )

  useEffect(() => {
    syncEngine.setLoop(loop)
  }, [loop])

  const bind = useCallback(
    (setTime: (time: number) => void) => syncEngine.subscribe((time) => setTime(time)),
    [],
  )

  const onSeek = useCallback((time: number) => syncEngine.seek(time), [])
  const wasPlaying = useRef(false)

  return (
    <footer className="transport" data-empty={!hasVideo}>
      <div className="transport__buttons">
        <button
          type="button"
          className="iconbtn iconbtn--lg"
          onClick={() => syncEngine.step(-FRAME_JUMP)}
          disabled={!hasVideo}
          aria-label={`Back ${FRAME_JUMP} frames`}
          title={`Back ${FRAME_JUMP} frames (shift + comma)`}
        >
          <JumpBackIcon size={16} />
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--lg"
          onClick={() => syncEngine.step(-1)}
          disabled={!hasVideo}
          aria-label="Previous frame"
          title="Previous frame (left arrow, or comma)"
        >
          <StepBackIcon size={18} />
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--play"
          onClick={() => syncEngine.toggle()}
          disabled={!hasVideo}
          aria-label={playing ? 'Pause all' : 'Play all'}
          aria-pressed={playing}
          title={playing ? 'Pause all (space)' : 'Play all (space)'}
        >
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--lg"
          onClick={() => syncEngine.step(1)}
          disabled={!hasVideo}
          aria-label="Next frame"
          title="Next frame (right arrow, or period)"
        >
          <StepForwardIcon size={18} />
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--lg"
          onClick={() => syncEngine.step(FRAME_JUMP)}
          disabled={!hasVideo}
          aria-label={`Forward ${FRAME_JUMP} frames`}
          title={`Forward ${FRAME_JUMP} frames (shift + period)`}
        >
          <JumpForwardIcon size={16} />
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--lg"
          onClick={() => {
            syncEngine.pause()
            syncEngine.seek(0)
          }}
          disabled={!hasVideo}
          aria-label="Stop and rewind"
          title="Stop and rewind (home)"
        >
          <StopIcon size={16} />
        </button>
        <button
          type="button"
          className="iconbtn iconbtn--lg"
          aria-pressed={loop}
          onClick={() => setLoop(!loop)}
          disabled={!hasVideo}
          aria-label="Loop playback"
          title="Loop (L)"
        >
          <LoopIcon size={16} />
        </button>
      </div>

      <div className="transport__timecode">
        <span ref={timecodeRef} className="timecode" title="Master timecode">
          00:00:00:00
        </span>
        <span className="timecode timecode--muted">{formatClock(duration)}</span>
      </div>

      <div className="transport__scrub">
        <Scrubber
          duration={duration}
          bind={bind}
          onSeek={onSeek}
          onScrubStart={() => {
            wasPlaying.current = syncEngine.isPlaying
            if (wasPlaying.current) syncEngine.pause()
          }}
          onScrubEnd={() => {
            if (wasPlaying.current) syncEngine.play()
            wasPlaying.current = false
          }}
          label="Master position, all panels"
          disabled={!hasVideo}
        />
      </div>

      <div className="transport__rate" role="group" aria-label="Playback speed">
        <div className="segmented segmented--tight">
          {RATES.map((option) => (
            <button
              key={option}
              type="button"
              className="segmented__item"
              aria-pressed={rate === option}
              disabled={!hasVideo}
              onClick={() => {
                setRate(option)
                syncEngine.setPlaybackRate(option)
              }}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      <div className="transport__volume">
        <VolumeControl
          volume={globalVolume}
          muted={globalMuted}
          onVolume={setGlobalVolume}
          onToggleMute={toggleGlobalMute}
          label="all panels"
          disabled={!hasVideo}
        />
        <span className="transport__hint">{videoCount} synced</span>
      </div>

      <CoffeeLink />
    </footer>
  )
}
