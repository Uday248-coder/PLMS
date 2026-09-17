/**
 * connectionStore.js
 * --------------------------------------------------------------------------
 * Tracks the realtime channel status. The websocket service pushes updates
 * here as connections are established, lost, or retried.
 */

import { create } from 'zustand'

export const useConnectionStore = create((set, get) => ({
  status: 'OFFLINE', // 'CONNECTED' | 'RECONNECTING' | 'OFFLINE'
  lastEventAt: null,
  reconnectAttempt: 0,

  setStatus(status) {
    set({ status })
  },

  noteEvent() {
    set({ lastEventAt: Date.now() })
  },

  bumpReconnect() {
    set({ reconnectAttempt: get().reconnectAttempt + 1 })
  },

  resetReconnect() {
    set({ reconnectAttempt: 0 })
  },
}))
