/**
 * SyncEngine - keeps every registered video element locked to one timeline.
 *
 * Design notes
 * ------------
 * * One rAF loop drives everything. Components subscribe and write to DOM refs
 *   directly, so a 60 Hz playhead never triggers a React render.
 * * The *master* is the longest ready clip. Everything else is corrected
 *   against it, which keeps the shortest clip from dragging the group.
 * * Correction is two-tier: a tiny drift is absorbed by nudging playbackRate
 *   (inaudible, no visual hitch), a large drift is a hard seek. Hard seeks
 *   during playback are what make naive implementations stutter.
 */

import { safeTime } from './guards'

/** Minimal surface of HTMLVideoElement the engine needs - keeps it testable. */
export interface SyncTarget {
  currentTime: number
  playbackRate: number
  readonly duration: number
  readonly paused: boolean
  readonly seeking: boolean
  readonly readyState: number
  play(): Promise<void> | void
  pause(): void
}

/** Under this drift, do nothing at all. */
export const DRIFT_IGNORE = 0.012
/** Between ignore and this, correct smoothly with playbackRate. */
export const DRIFT_HARD_SEEK = 0.25
/** How far playbackRate may deviate while catching up. */
export const RATE_TRIM = 0.06

export const DEFAULT_FPS = 30

/** How far the jog buttons and the shift+jog keys move, in frames. */
export const FRAME_JUMP = 10

export type TimeListener = (time: number, duration: number, playing: boolean) => void

interface Entry {
  id: string
  target: SyncTarget
  fps: number
}

export class SyncEngine {
  private entries = new Map<string, Entry>()
  private listeners = new Set<TimeListener>()
  private raf = 0
  private playing = false
  private time = 0
  private rate = 1
  private looping = true
  private scheduler: (cb: () => void) => number
  private canceller: (handle: number) => void

  constructor(
    scheduler: (cb: () => void) => number = (cb) => requestAnimationFrame(() => cb()),
    canceller: (handle: number) => void = (h) => cancelAnimationFrame(h),
  ) {
    this.scheduler = scheduler
    this.canceller = canceller
  }

  // ---------------------------------------------------------------- registry

  register(id: string, target: SyncTarget, fps = DEFAULT_FPS): void {
    this.entries.set(id, { id, target, fps })
    // A clip joining a running session starts where everybody else is.
    target.currentTime = safeTime(this.time, target.duration)
    target.playbackRate = this.rate
    if (this.playing) void target.play()
    this.ensureLoop()
  }

  unregister(id: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      try {
        entry.target.pause()
      } catch {
        /* element already detached */
      }
    }
    this.entries.delete(id)
    if (this.entries.size === 0) {
      this.playing = false
      this.stopLoop()
      this.emit()
    }
  }

  setFps(id: string, fps: number): void {
    const entry = this.entries.get(id)
    if (entry && fps > 0) entry.fps = fps
  }

  get size(): number {
    return this.entries.size
  }

  // ---------------------------------------------------------------- timeline

  /** Longest ready clip wins; that is the timeline the UI shows. */
  get duration(): number {
    let max = 0
    for (const { target } of this.entries.values()) {
      const d = target.duration
      if (Number.isFinite(d) && d > max) max = d
    }
    return max
  }

  get currentTime(): number {
    return this.time
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get playbackRate(): number {
    return this.rate
  }

  /** Frame rate of the master clip, used for frame stepping. */
  get masterFps(): number {
    return this.master()?.fps ?? DEFAULT_FPS
  }

  private master(): Entry | null {
    let best: Entry | null = null
    let bestDuration = -1
    for (const entry of this.entries.values()) {
      const d = entry.target.duration
      if (Number.isFinite(d) && d > bestDuration) {
        bestDuration = d
        best = entry
      }
    }
    return best
  }

  // ---------------------------------------------------------------- transport

  /** Issue play() on every registered element. Safe to call repeatedly. */
  private startAll(): void {
    for (const { target } of this.entries.values()) {
      target.playbackRate = this.rate
      try {
        const result = target.play()
        if (result && typeof (result as Promise<void>).catch === 'function') {
          ;(result as Promise<void>).catch(() => {
            /* autoplay policy or detached element - the rAF loop recovers */
          })
        }
      } catch {
        /* ignore */
      }
    }
  }

  play(): void {
    if (this.entries.size === 0) return
    if (this.duration > 0 && this.time >= this.duration - 0.001) this.seek(0)
    this.playing = true
    this.startAll()
    this.ensureLoop()
    this.emit()
  }

  pause(): void {
    this.playing = false
    for (const { target } of this.entries.values()) {
      try {
        target.pause()
        target.playbackRate = this.rate
      } catch {
        /* ignore */
      }
    }
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(seconds: number): void {
    const duration = this.duration
    this.time = safeTime(seconds, duration || Number.POSITIVE_INFINITY)
    for (const { target } of this.entries.values()) {
      // Clips shorter than the master simply sit on their last frame.
      target.currentTime = safeTime(this.time, target.duration)
    }
    this.emit()
  }

  seekBy(deltaSeconds: number): void {
    this.seek(this.time + deltaSeconds)
  }

  /** Step whole frames on the master's grid, snapping onto frame centres. */
  step(frames: number, fpsOverride?: number): void {
    const fps = fpsOverride && fpsOverride > 0 ? fpsOverride : this.masterFps || DEFAULT_FPS
    if (this.playing) this.pause()
    // floor, not round: the playhead already sits mid-frame after a step, so
    // rounding would land on the next boundary and make step(-1) a no-op.
    const frameIndex = Math.floor(this.time * fps + 1e-6) + frames
    // +0.5 lands mid-frame, which is what browsers decode reliably.
    this.seek(Math.max(0, (frameIndex + 0.5) / fps))
  }

  setPlaybackRate(rate: number): void {
    this.rate = rate > 0 && Number.isFinite(rate) ? rate : 1
    for (const { target } of this.entries.values()) target.playbackRate = this.rate
    this.emit()
  }

  setLoop(loop: boolean): void {
    this.looping = loop
  }

  // ---------------------------------------------------------------- the loop

  private ensureLoop(): void {
    if (this.raf === 0) this.raf = this.scheduler(this.tick)
  }

  private stopLoop(): void {
    if (this.raf !== 0) {
      this.canceller(this.raf)
      this.raf = 0
    }
  }

  /** Exposed for tests; in the browser the rAF scheduler calls it. */
  readonly tick = (): void => {
    this.raf = 0
    const master = this.master()

    if (master) {
      if (this.playing) this.time = master.target.currentTime
      this.correct(master)

      const duration = this.duration
      if (this.playing && this.reachedEnd(master, duration)) {
        if (this.looping) {
          // Rewinding is not enough: the master has *ended*, so it is paused,
          // and correct() deliberately never touches the master. Without an
          // explicit restart the timeline rewinds and then sits there.
          this.seek(0)
          this.startAll()
        } else {
          this.pause()
        }
      }
    }

    this.emit()
    if (this.entries.size > 0) this.ensureLoop()
  }

  /**
   * The timeline is finished when the playhead is at the very end *and* the
   * master has stopped of its own accord (or run past its duration). Checking
   * only the time would fire a frame early on some decoders.
   */
  private reachedEnd(master: Entry, duration: number): boolean {
    if (duration <= 0) return false
    if (this.time < duration - 0.05) return false
    return master.target.paused || this.time >= duration
  }

  /** Pull every follower back onto the master's clock. */
  private correct(master: Entry): void {
    const masterTime = master.target.currentTime
    for (const entry of this.entries.values()) {
      const { target } = entry
      if (entry === master) continue
      if (target.seeking || target.readyState < 2) continue

      // A follower that already ran out just parks on its last frame.
      if (Number.isFinite(target.duration) && masterTime > target.duration) {
        if (!target.paused) target.pause()
        continue
      }
      if (this.playing && target.paused) {
        void target.play()
      }

      const drift = target.currentTime - masterTime
      const magnitude = Math.abs(drift)

      if (magnitude > DRIFT_HARD_SEEK || !this.playing) {
        if (magnitude > DRIFT_IGNORE) target.currentTime = safeTime(masterTime, target.duration)
        target.playbackRate = this.rate
      } else if (magnitude > DRIFT_IGNORE) {
        // Behind -> speed up slightly, ahead -> slow down slightly.
        const trim = drift < 0 ? RATE_TRIM : -RATE_TRIM
        target.playbackRate = this.rate * (1 + trim)
      } else {
        target.playbackRate = this.rate
      }
    }
  }

  // ---------------------------------------------------------------- pub/sub

  subscribe(listener: TimeListener): () => void {
    this.listeners.add(listener)
    try {
      listener(this.time, this.duration, this.playing)
    } catch (error) {
      console.error('[ABCvers] sync listener failed on subscribe', error)
    }
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const duration = this.duration
    for (const listener of this.listeners) {
      try {
        listener(this.time, duration, this.playing)
      } catch (error) {
        console.error('[ABCvers] sync listener failed', error)
      }
    }
  }

  destroy(): void {
    this.stopLoop()
    this.entries.clear()
    this.listeners.clear()
    this.playing = false
  }
}

/** The one engine the app uses. Tests build their own instances. */
export const syncEngine = new SyncEngine()
