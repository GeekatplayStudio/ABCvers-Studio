import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DRIFT_HARD_SEEK, SyncEngine, type SyncTarget } from './sync'

/** A controllable stand-in for HTMLVideoElement. */
class FakeVideo implements SyncTarget {
  currentTime = 0
  playbackRate = 1
  duration: number
  paused = true
  seeking = false
  readyState = 4
  playCalls = 0

  constructor(duration: number) {
    this.duration = duration
  }

  play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
    return Promise.resolve()
  }

  pause(): void {
    this.paused = true
  }

  /** Advance as a real element would, at its current rate. */
  advance(seconds: number): void {
    if (this.paused) return
    this.currentTime = Math.min(this.duration, this.currentTime + seconds * this.playbackRate)
  }
}

/** Manual scheduler: tests decide exactly when frames happen. */
function manualEngine() {
  const queue: (() => void)[] = []
  let handle = 0
  const engine = new SyncEngine(
    (cb) => {
      queue.push(cb)
      return ++handle
    },
    () => {},
  )
  const frame = () => {
    const pending = queue.splice(0, queue.length)
    pending.forEach((cb) => cb())
  }
  return { engine, frame }
}

describe('SyncEngine registration', () => {
  let engine: SyncEngine

  beforeEach(() => {
    engine = new SyncEngine(
      () => 0,
      () => {},
    )
  })

  it('reports the longest clip as the timeline', () => {
    engine.register('a', new FakeVideo(10))
    engine.register('b', new FakeVideo(31.5))
    expect(engine.duration).toBeCloseTo(31.5)
    expect(engine.size).toBe(2)
  })

  it('drops a clip that joins late onto the current playhead', () => {
    const first = new FakeVideo(20)
    engine.register('a', first)
    engine.seek(7)
    const late = new FakeVideo(20)
    engine.register('b', late)
    expect(late.currentTime).toBeCloseTo(7)
  })

  it('starts a late arrival playing when the session is playing', () => {
    engine.register('a', new FakeVideo(20))
    engine.play()
    const late = new FakeVideo(20)
    engine.register('b', late)
    expect(late.playCalls).toBe(1)
  })

  it('pauses and forgets an unregistered clip', () => {
    const target = new FakeVideo(20)
    engine.register('a', target)
    engine.play()
    engine.unregister('a')
    expect(target.paused).toBe(true)
    expect(engine.size).toBe(0)
    expect(engine.isPlaying).toBe(false)
  })
})

describe('SyncEngine transport', () => {
  it('plays and pauses every registered clip at once', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    const a = new FakeVideo(10)
    const b = new FakeVideo(10)
    engine.register('a', a)
    engine.register('b', b)

    engine.play()
    expect(a.paused).toBe(false)
    expect(b.paused).toBe(false)
    expect(engine.isPlaying).toBe(true)

    engine.pause()
    expect(a.paused).toBe(true)
    expect(b.paused).toBe(true)
    expect(engine.isPlaying).toBe(false)
  })

  it('seeks every clip, clamped to its own duration', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    const long = new FakeVideo(30)
    const short = new FakeVideo(4)
    engine.register('long', long)
    engine.register('short', short)

    engine.seek(12)
    expect(long.currentTime).toBeCloseTo(12)
    expect(short.currentTime).toBeCloseTo(4)
    expect(engine.currentTime).toBeCloseTo(12)
  })

  it('refuses to seek outside the timeline', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    engine.register('a', new FakeVideo(10))
    engine.seek(-5)
    expect(engine.currentTime).toBe(0)
    engine.seek(1e9)
    expect(engine.currentTime).toBeCloseTo(10)
  })

  it('steps whole frames and pauses first', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    const target = new FakeVideo(10)
    engine.register('a', target, 25)
    engine.play()

    engine.step(1)
    expect(engine.isPlaying).toBe(false)
    expect(engine.currentTime).toBeCloseTo(1.5 / 25)

    engine.step(-1)
    expect(engine.currentTime).toBeCloseTo(0.5 / 25)
  })

  it('never steps below zero', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    engine.register('a', new FakeVideo(10), 30)
    engine.step(-50)
    expect(engine.currentTime).toBe(0)
  })

  it('applies playback rate to every clip', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    const a = new FakeVideo(10)
    const b = new FakeVideo(10)
    engine.register('a', a)
    engine.register('b', b)
    engine.setPlaybackRate(2)
    expect(a.playbackRate).toBe(2)
    expect(b.playbackRate).toBe(2)
    engine.setPlaybackRate(-1)
    expect(a.playbackRate).toBe(1)
  })
})

describe('SyncEngine drift correction', () => {
  it('hard-seeks a follower that has fallen badly behind', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(30)
    const follower = new FakeVideo(30)
    engine.register('master', master)
    engine.register('follower', follower)
    engine.play()

    master.currentTime = 10
    follower.currentTime = 10 - (DRIFT_HARD_SEEK + 1)
    frame()

    expect(follower.currentTime).toBeCloseTo(10)
    expect(follower.playbackRate).toBe(1)
  })

  it('nudges playback rate for a small drift instead of seeking', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(30)
    const follower = new FakeVideo(30)
    engine.register('master', master)
    engine.register('follower', follower)
    engine.play()

    master.currentTime = 10
    follower.currentTime = 9.9 // behind by 100ms
    frame()

    expect(follower.currentTime).toBeCloseTo(9.9) // no jarring seek
    expect(follower.playbackRate).toBeGreaterThan(1)

    follower.currentTime = 10.1 // now ahead
    frame()
    expect(follower.playbackRate).toBeLessThan(1)
  })

  it('leaves a clip alone while it is inside the ignore window', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(30)
    const follower = new FakeVideo(30)
    engine.register('master', master)
    engine.register('follower', follower)
    engine.play()

    master.currentTime = 10
    follower.currentTime = 10.005
    frame()

    expect(follower.currentTime).toBeCloseTo(10.005)
    expect(follower.playbackRate).toBe(1)
  })

  it('does not fight a clip that is still seeking or buffering', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(30)
    const follower = new FakeVideo(30)
    engine.register('master', master)
    engine.register('follower', follower)
    engine.play()

    master.currentTime = 10
    follower.currentTime = 0
    follower.seeking = true
    frame()
    expect(follower.currentTime).toBe(0)

    follower.seeking = false
    follower.readyState = 1
    frame()
    expect(follower.currentTime).toBe(0)
  })

  it('parks a short clip on its last frame instead of restarting it', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(30)
    const short = new FakeVideo(5)
    engine.register('master', master)
    engine.register('short', short)
    engine.play()

    master.currentTime = 12
    short.currentTime = 5
    frame()

    expect(short.paused).toBe(true)
    expect(short.currentTime).toBeCloseTo(5)
  })

  it('publishes the master time to subscribers', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(30)
    engine.register('master', master)
    engine.play()

    const seen: number[] = []
    engine.subscribe((time) => seen.push(time))

    master.currentTime = 3
    frame()
    expect(seen.at(-1)).toBeCloseTo(3)
  })

  it('keeps running when a subscriber throws', () => {
    const { engine, frame } = manualEngine()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    engine.register('a', new FakeVideo(10))
    engine.subscribe(() => {
      throw new Error('listener blew up')
    })
    const good = vi.fn()
    engine.subscribe(good)

    expect(() => frame()).not.toThrow()
    expect(good).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('unsubscribes cleanly', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    const listener = vi.fn()
    const off = engine.subscribe(listener)
    expect(listener).toHaveBeenCalledTimes(1) // immediate priming call
    off()
    engine.register('a', new FakeVideo(5))
    engine.seek(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('SyncEngine end of timeline', () => {
  it('stops at the end when looping is off', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(10)
    engine.register('master', master)
    engine.setLoop(false)
    engine.play()

    master.currentTime = 10
    master.paused = true
    frame()

    expect(engine.isPlaying).toBe(false)
  })

  it('rewinds AND restarts playback when looping', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(10)
    engine.register('master', master)
    engine.setLoop(true)
    engine.play()
    const callsBeforeEnd = master.playCalls

    // The element reaches its end: browsers pause it and fire `ended`.
    master.currentTime = 10
    master.paused = true
    frame()

    expect(engine.currentTime).toBe(0)
    expect(engine.isPlaying).toBe(true)
    // The master is never touched by drift correction, so without an explicit
    // restart it would rewind and then sit there paused forever.
    expect(master.paused).toBe(false)
    expect(master.playCalls).toBeGreaterThan(callsBeforeEnd)
  })

  it('keeps looping round after round', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(10)
    engine.register('master', master)
    engine.setLoop(true)
    engine.play()

    for (let lap = 0; lap < 3; lap++) {
      master.currentTime = 10
      master.paused = true
      frame()
      expect(engine.currentTime).toBe(0)
      expect(master.paused).toBe(false)
    }
    expect(engine.isPlaying).toBe(true)
  })

  it('restarts every panel on the loop, including one that ran out early', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(20)
    const short = new FakeVideo(5)
    engine.register('master', master)
    engine.register('short', short)
    engine.setLoop(true)
    engine.play()

    // The short clip parks on its last frame part way through.
    master.currentTime = 12
    short.currentTime = 5
    frame()
    expect(short.paused).toBe(true)

    // At the end of the timeline everything rewinds and plays again.
    master.currentTime = 20
    master.paused = true
    frame()
    expect(engine.currentTime).toBe(0)
    expect(master.paused).toBe(false)
    expect(short.paused).toBe(false)
    expect(short.currentTime).toBe(0)
  })

  it('loops by default', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(10)
    engine.register('master', master)
    engine.play()

    master.currentTime = 10
    master.paused = true
    frame()

    expect(engine.isPlaying).toBe(true)
    expect(engine.currentTime).toBe(0)
  })

  it('does not fire the end handler in the middle of a clip', () => {
    const { engine, frame } = manualEngine()
    const master = new FakeVideo(10)
    engine.register('master', master)
    engine.play()

    master.currentTime = 4
    frame()
    expect(engine.currentTime).toBeCloseTo(4)
    expect(engine.isPlaying).toBe(true)
  })

  it('restarts from zero when play is pressed at the end', () => {
    const engine = new SyncEngine(
      () => 0,
      () => {},
    )
    engine.register('a', new FakeVideo(10))
    engine.seek(10)
    engine.play()
    expect(engine.currentTime).toBe(0)
  })
})
