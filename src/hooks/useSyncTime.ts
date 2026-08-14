import { useEffect } from 'react'
import { syncEngine, type TimeListener } from '../lib/sync'

/**
 * Subscribe to the playhead without re-rendering. The callback runs on every
 * animation frame, so it must only touch refs / DOM - never setState.
 */
export function useSyncTime(listener: TimeListener): void {
  useEffect(() => syncEngine.subscribe(listener), [listener])
}
