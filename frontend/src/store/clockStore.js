/**
 * clockStore.js
 * --------------------------------------------------------------------------
 * Owns the Virtual Clock used by the entire UI. The clock is decoupled from
 * the system wall clock so admins can fast-forward and demonstrate shift
 * transitions / overstay / fines.
 *
 * Mechanism:
 *   virtualNow = baseReal + speed * (realNow - baseReal) + manualOffset
 *
 * - `speed` is a multiplier applied to elapsed real time.
 * - `manualOffset` allows admins to jump the clock by a fixed amount.
 * - `setSpeed(1|5|60)` is exposed to the admin controls.
 * - `setManualTime(date)` aligns `baseReal` and resets offset so the
 *    resulting virtualNow matches the requested date.
 *
 * The store also exposes `shift` (SHIFT_1 | MIDDAY_CLOSED | SHIFT_2 |
 * OFF_HOURS) recomputed on every tick.
 */

import { create } from 'zustand'
import { shiftForDate } from '@/components/ui/statusTokens'
import config from '@/config'

const DEFAULT_BASE = Date.now()

export const useClockStore = create((set, get) => ({
  // Speed multiplier applied to wall-clock drift
  speed: 1,
  // Optional manual offset in ms (added on top of speed-adjusted drift)
  manualOffset: 0,
  // The base wall-clock moment when virtual time was last aligned
  baseReal: DEFAULT_BASE,
  // The virtual timestamp the base moment represents
  baseVirtual: DEFAULT_BASE,
  // Server-synced virtual time (ms epoch). null until /api/clock responds.
  serverVirtual: null,
  // Tick counter — increments each animation frame so components can react.
  tick: 0,
  // Server-reported speed (may differ from local while WebSocket syncs).
  serverSpeed: 1,

  /**
   * Compute the current virtual Date based on accumulated state.
   * Reads from closure-cached `get` to avoid stale snapshots.
   */
  now() {
    const { baseReal, baseVirtual, manualOffset, speed } = get()
    const realElapsed = Date.now() - baseReal
    return new Date(baseVirtual + manualOffset + realElapsed * speed)
  },

  /** Tick — call from a global animation loop. */
  pulse() {
    set({ tick: get().tick + 1 })
  },

  setSpeed(speed) {
    const next = Number(speed) || 1
    // Reset base so the visible clock doesn't jump — anchor it to current
    // virtual time before changing speed.
    const cur = get().now()
    set({
      speed: next,
      baseReal: Date.now(),
      baseVirtual: cur.getTime(),
      manualOffset: 0,
      serverSpeed: next,
    })
  },

  /**
   * Jump forward/backward by a duration (ms). The virtual clock moves
   * immediately and the speed multiplier is preserved.
   */
  jump(deltaMs) {
    set({ manualOffset: get().manualOffset + Number(deltaMs || 0) })
  },

  /** Hard-set the clock to a specific Date. */
  setManualTime(date) {
    const target = date instanceof Date ? date.getTime() : Number(date)
    set({
      baseReal: Date.now(),
      baseVirtual: target,
      manualOffset: 0,
    })
  },

  /** Reset back to "real" wall-clock time. */
  reset() {
    const now = Date.now()
    set({ speed: 1, manualOffset: 0, baseReal: now, baseVirtual: now, serverSpeed: 1 })
  },

  /** Update from a server tick payload (broadcast over WebSocket). */
  applyServerTick({ virtual_time, speed } = {}) {
    if (typeof virtual_time === 'string' || typeof virtual_time === 'number') {
      const t = new Date(virtual_time).getTime()
      set({ serverVirtual: t, baseVirtual: t, baseReal: Date.now(), manualOffset: 0 })
    }
    if (typeof speed === 'number') set({ serverSpeed: speed })
  },

  /** Helper: shift bucket for the current virtual moment. */
  currentShift() {
    return shiftForDate(get().now())
  },
}))

/**
 * Boot a single global animation-frame loop that pulses the clock every
 * frame. Components select `tick` to subscribe to the live clock and only
 * re-render when the store mutates.
 */
let rafHandle = null
let lastSecond = -1
export function startClockLoop() {
  if (rafHandle) return
  const loop = () => {
    const s = useClockStore.getState()
    s.pulse()
    // Lightweight second-counter debug — keeps store from accumulating
    // a huge tick counter but lets subscribers know each render.
    lastSecond = (lastSecond + 1) % 1_000_000
    rafHandle = requestAnimationFrame(loop)
  }
  rafHandle = requestAnimationFrame(loop)
}

export function stopClockLoop() {
  if (rafHandle) cancelAnimationFrame(rafHandle)
  rafHandle = null
}

// Convenience: read current virtual Date outside React (e.g. inside Zustand).
export function currentVirtualDate() {
  return useClockStore.getState().now()
}

// Convenience: read formatted clock string for non-React use.
export function formatClock(d = currentVirtualDate()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Re-export shift label from config for the header bar.
export function shiftLabel(shift) {
  return config.shifts[shift]?.label || shift
}
