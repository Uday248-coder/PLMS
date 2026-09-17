/**
 * PLMS Frontend Configuration
 * --------------------------------------------------------------------------
 * Centralized configuration for runtime endpoints and tunables.
 * All values can be overridden at build-time via Vite environment variables
 * (e.g. VITE_API_BASE, VITE_WS_URL). Falling back to sensible local defaults
 * means the frontend is fully interactive even before the backend boots.
 */

const env = import.meta.env || {}

export const config = {
  // REST API root — when the FastAPI backend is online, point to /api.
  apiBase: env.VITE_API_BASE || '/api',

  // WebSocket endpoint — drives live clock + slot + fine broadcasts.
  wsUrl: env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/live`,

  // Frontend is wired against a mocked backend by default. Flip this to
  // `false` once the FastAPI service is running to talk to real endpoints.
  useMockBackend: (env.VITE_USE_MOCK ?? 'true') !== 'false',

  // Fine engine tunables — mirrored from backend/business rules.
  fine: {
    hourlyRate: 200, // ₹200 / hour overstay
    graceMinutes: 15, // grace window after shift end
    latePenaltyPerDay: 20, // ₹20 / day after 7 days unpaid
    flagThreshold: 1000, // ₹1,000 unpaid triggers is_flagged
  },

  // Shift schedule (24-hour).
  shifts: {
    SHIFT_1: { label: 'Shift 1 — Morning', start: '09:00', end: '12:30', graceEnd: '12:45' },
    MIDDAY_CLOSED: { label: 'Midday Closure', start: '12:30', end: '14:00' },
    SHIFT_2: { label: 'Shift 2 — Afternoon', start: '14:00', end: '17:30', graceEnd: '17:45' },
    OFF_HOURS: { label: 'Off Hours', start: '17:30', end: '09:00' },
  },
}

export default config
