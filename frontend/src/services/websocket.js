/**
 * websocket.js
 * --------------------------------------------------------------------------
 * Manages a single WebSocket connection to the live channel.
 * In mock mode the real network is bypassed and events are routed through
 * the in-memory event bus from services/api.js.
 *
 * The exported `subscribe(handler)` returns an unsubscribe function. The
 * same handler is used for both mock and real WebSocket events so the UI
 * never needs to know which mode is active.
 *
 * Auto-reconnect: exponential backoff up to 30s. Updates
 * connectionStore accordingly.
 */

import config from '@/config'
import { useConnectionStore } from '@/store/connectionStore'
import { applyEvent, subscribeMockEvents, runOverstaySweep, readVirtualNow, virtualClock } from './api'
import { useClockStore } from '@/store/clockStore'

const handlers = new Set()

function fanout(event) {
  for (const h of handlers) {
    try {
      h(event)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS handler error', err)
    }
  }
}

/* --------------------------------------------------------------------------
 * Mock transport — wires the api.js event bus to subscribers and emits
 * a CLOCK_TICK every second so the UI mirror stays alive.
 * -------------------------------------------------------------------------- */
let mockTimer = null
let sweepTimer = null
function startMockTransport() {
  if (mockTimer) return
  // Subscribe to mock mutations
  subscribeMockEvents((event) => {
    fanout(event)
    useConnectionStore.getState().noteEvent()
  })
  // Periodic tick — emits CLOCK_TICK at 1Hz so all subscribers stay in sync
  mockTimer = setInterval(() => {
    const v = readVirtualNow()
    fanout({
      type: 'CLOCK_TICK',
      virtual_time: v.toISOString(),
      speed: virtualClock.speed,
    })
    useConnectionStore.getState().noteEvent()
  }, 1000)
  // Overstay sweep — every 2s scan for bookings past their grace window
  sweepTimer = setInterval(() => {
    runOverstaySweep()
  }, 2000)
  useConnectionStore.getState().setStatus('CONNECTED')
}

function stopMockTransport() {
  if (mockTimer) clearInterval(mockTimer)
  if (sweepTimer) clearInterval(sweepTimer)
  mockTimer = null
  sweepTimer = null
}

/* --------------------------------------------------------------------------
 * Real WebSocket transport — auto-reconnect with backoff
 * -------------------------------------------------------------------------- */
let ws = null
let wsAttempt = 0
let wsShouldRun = false

function scheduleReconnect() {
  const delay = Math.min(30000, 500 * 2 ** wsAttempt)
  wsAttempt += 1
  useConnectionStore.getState().setStatus('RECONNECTING')
  useConnectionStore.getState().bumpReconnect()
  setTimeout(connect, delay)
}

function connect() {
  if (!wsShouldRun) return
  try {
    ws = new WebSocket(config.wsUrl)
  } catch (err) {
    scheduleReconnect()
    return
  }
  ws.addEventListener('open', () => {
    wsAttempt = 0
    useConnectionStore.getState().resetReconnect()
    useConnectionStore.getState().setStatus('CONNECTED')
  })
  ws.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data)
      applyEvent(data)
      // Mirror admin-set speeds into local store
      if (data.type === 'CLOCK_TICK' && typeof data.speed === 'number') {
        useClockStore.getState().applyServerTick({ virtual_time: data.virtual_time, speed: data.speed })
      }
      fanout(data)
      useConnectionStore.getState().noteEvent()
    } catch (err) {
      // ignore malformed
    }
  })
  ws.addEventListener('close', () => {
    useConnectionStore.getState().setStatus('OFFLINE')
    scheduleReconnect()
  })
  ws.addEventListener('error', () => {
    try {
      ws?.close()
    } catch (e) {
      // ignore
    }
  })
}

function startRealTransport() {
  wsShouldRun = true
  connect()
}

function stopRealTransport() {
  wsShouldRun = false
  try {
    ws?.close()
  } catch (e) {
    // ignore
  }
  ws = null
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */
let booted = false

export function bootWebSocket() {
  if (booted) return
  booted = true
  if (config.useMockBackend) {
    startMockTransport()
  } else {
    startRealTransport()
  }
}

export function shutdownWebSocket() {
  booted = false
  stopMockTransport()
  stopRealTransport()
  useConnectionStore.getState().setStatus('OFFLINE')
}

export function subscribe(handler) {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

// For tests / debug
export const __debug = {
  forceOffline() {
    useConnectionStore.getState().setStatus('OFFLINE')
    fanout({ type: 'CONNECTION_LOST' })
  },
  forceOnline() {
    useConnectionStore.getState().setStatus('CONNECTED')
    fanout({ type: 'CONNECTION_RESTORED' })
  },
}
