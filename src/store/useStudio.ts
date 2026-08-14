/**
 * Single source of truth for the studio session.
 *
 * Deliberately excludes the playhead: the current time changes 60 times a
 * second and lives in SyncEngine, which pushes it straight into DOM refs.
 * Keeping it out of this store is the main reason playback stays smooth.
 */

import { create } from 'zustand'
import type { AspectKey, FitMode, MediaItem, MediaMeta, Rect } from '../types'
import { intakeFiles, type RejectedFile } from '../lib/media'
import { clamp, MAX_PANELS, safeExposure, safeVolume } from '../lib/guards'
import { clampRect, FULL_RECT, isFullRect, zoomRectBy } from '../lib/zoom'
import { panelWeight, resizePair } from '../lib/layout'

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'warn' | 'error'
}

export interface StudioState {
  items: MediaItem[]
  aspect: AspectKey
  fitMode: FitMode
  columns: number | 'auto'
  zoom: Rect | null
  zoomMode: boolean
  globalVolume: number
  globalMuted: boolean
  loop: boolean
  showInfo: boolean
  showOverlayName: boolean
  showRenderTime: boolean
  toasts: Toast[]

  addFiles: (files: readonly File[]) => void
  removeItem: (id: string) => void
  clearAll: () => void
  moveItem: (id: string, direction: -1 | 1) => void

  setMeta: (id: string, meta: MediaMeta) => void
  setFps: (id: string, fps: number) => void
  setStatus: (id: string, status: MediaItem['status'], error?: string) => void

  setAspect: (aspect: AspectKey) => void
  setFitMode: (mode: FitMode) => void
  setColumns: (columns: number | 'auto') => void
  resetWidths: () => void

  setZoom: (rect: Rect | null) => void
  zoomBy: (factor: number) => void
  resetZoom: () => void
  setZoomMode: (on: boolean) => void
  toggleZoomMode: () => void

  setItemVolume: (id: string, volume: number) => void
  toggleItemMute: (id: string) => void
  soloItem: (id: string) => void
  setGlobalVolume: (volume: number) => void
  toggleGlobalMute: () => void
  setExposure: (id: string, stops: number) => void

  setLoop: (loop: boolean) => void
  toggleInfo: () => void
  toggleOverlayName: () => void
  toggleRenderTime: () => void
  setRenderTime: (id: string, value: string) => void

  resizeSplit: (leftId: string, rightId: string, deltaFraction: number) => void

  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

let toastSeq = 0

/** Object URLs are a real leak if we forget them; always release on removal. */
function releaseUrl(item: MediaItem | undefined): void {
  if (!item) return
  try {
    URL.revokeObjectURL(item.url)
  } catch {
    /* jsdom / already revoked */
  }
}

function rejectionMessage(rejected: RejectedFile[]): string {
  if (rejected.length === 1) {
    const only = rejected[0]!
    return `${only.name}: ${only.reason}`
  }
  return `${rejected.length} files skipped: ${rejected[0]!.reason}`
}

export const useStudio = create<StudioState>()((set, get) => ({
  items: [],
  aspect: 'free',
  fitMode: 'fit',
  columns: 'auto',
  zoom: null,
  zoomMode: false,
  globalVolume: 1,
  globalMuted: true, // browsers block audible autoplay; start safe and obvious
  loop: true, // comparison work is watched over and over - loop by default
  showInfo: true,
  showOverlayName: true,
  showRenderTime: false,
  toasts: [],

  addFiles: (files) => {
    if (!files || files.length === 0) return
    const existing = get().items.length
    const { accepted, rejected } = intakeFiles(Array.from(files), { existing })
    if (accepted.length > 0) {
      set((state) => ({ items: [...state.items, ...accepted] }))
    }
    if (rejected.length > 0) {
      get().pushToast(rejectionMessage(rejected), 'warn')
    }
  },

  removeItem: (id) => {
    releaseUrl(get().items.find((item) => item.id === id))
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },

  clearAll: () => {
    get().items.forEach(releaseUrl)
    set({ items: [], zoom: null, zoomMode: false })
  },

  moveItem: (id, direction) => {
    set((state) => {
      const index = state.items.findIndex((item) => item.id === id)
      if (index < 0) return state
      const target = index + direction
      if (target < 0 || target >= state.items.length) return state
      const items = [...state.items]
      const [moved] = items.splice(index, 1)
      items.splice(target, 0, moved!)
      return { items }
    })
  },

  setMeta: (id, meta) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, meta, status: 'ready', error: undefined } : item,
      ),
    }))
  },

  setFps: (id, fps) => {
    if (!(fps > 0)) return
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id && item.meta ? { ...item, meta: { ...item.meta, fps } } : item,
      ),
    }))
  },

  setStatus: (id, status, error) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, status, error } : item)),
    }))
  },

  setAspect: (aspect) => {
    // Aspect changes invalidate user-tuned widths - go back to derived ones.
    set((state) => ({ aspect, items: state.items.map((item) => ({ ...item, weight: null })) }))
  },

  setFitMode: (fitMode) => set({ fitMode }),

  setColumns: (columns) => {
    set({ columns: columns === 'auto' ? 'auto' : clamp(Math.round(columns), 1, MAX_PANELS) })
  },

  /** Drop every splitter drag and go back to edge-to-edge default widths. */
  resetWidths: () => {
    set((state) => ({ items: state.items.map((item) => ({ ...item, weight: null })) }))
  },

  setZoom: (rect) => {
    if (!rect || isFullRect(rect)) {
      set({ zoom: null })
      return
    }
    set({ zoom: clampRect(rect) })
  },

  zoomBy: (factor) => {
    const next = zoomRectBy(get().zoom ?? FULL_RECT, factor)
    set({ zoom: isFullRect(next) ? null : next })
  },

  resetZoom: () => set({ zoom: null }),

  setZoomMode: (on) => set({ zoomMode: on }),

  toggleZoomMode: () => set((state) => ({ zoomMode: !state.zoomMode })),

  setItemVolume: (id, volume) => {
    const value = safeVolume(volume)
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, volume: value, muted: value === 0 ? item.muted : false } : item,
      ),
    }))
  },

  toggleItemMute: (id) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, muted: !item.muted } : item)),
    }))
  },

  /** Alt-click on a panel's speaker: hear only that one. */
  soloItem: (id) => {
    const items = get().items
    const others = items.filter((item) => item.id !== id && item.kind === 'video')
    const alreadySolo = others.every((item) => item.muted)
    set({
      items: items.map((item) =>
        item.id === id ? { ...item, muted: false } : { ...item, muted: !alreadySolo },
      ),
      globalMuted: false,
    })
  },

  setGlobalVolume: (volume) => {
    const value = safeVolume(volume)
    set({ globalVolume: value, globalMuted: value === 0 ? get().globalMuted : false })
  },

  toggleGlobalMute: () => set((state) => ({ globalMuted: !state.globalMuted })),

  setExposure: (id, stops) => {
    const value = safeExposure(stops)
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, exposure: value } : item)),
    }))
  },

  setLoop: (loop) => set({ loop }),

  toggleInfo: () => set((state) => ({ showInfo: !state.showInfo })),

  toggleOverlayName: () => set((state) => ({ showOverlayName: !state.showOverlayName })),

  toggleRenderTime: () => set((state) => ({ showRenderTime: !state.showRenderTime })),

  setRenderTime: (id, value) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, renderTime: value } : item)),
    }))
  },

  resizeSplit: (leftId, rightId, deltaFraction) => {
    set((state) => {
      const left = state.items.find((item) => item.id === leftId)
      const right = state.items.find((item) => item.id === rightId)
      if (!left || !right) return state
      // Resolve the auto widths first, so the very first drag starts from what
      // is actually on screen instead of snapping to some other size.
      const [nextLeft, nextRight] = resizePair(
        panelWeight(left, state.aspect),
        panelWeight(right, state.aspect),
        deltaFraction,
      )
      return {
        items: state.items.map((item) =>
          item.id === leftId
            ? { ...item, weight: nextLeft }
            : item.id === rightId
              ? { ...item, weight: nextRight }
              : item,
        ),
      }
    })
  },

  pushToast: (message, tone = 'info') => {
    toastSeq += 1
    const id = `t_${toastSeq}`
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, tone }] }))
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/** Volume a given panel should actually output, after global controls. */
export function effectiveVolume(item: MediaItem, globalVolume: number, globalMuted: boolean): number {
  if (globalMuted || item.muted) return 0
  return safeVolume(item.volume * globalVolume)
}

export const selectVideoItems = (state: StudioState): MediaItem[] =>
  state.items.filter((item) => item.kind === 'video')
