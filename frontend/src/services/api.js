/**
 * api.js
 * --------------------------------------------------------------------------
 * Network layer for the PLMS frontend.
 *
 * The api service is built around a single `request(path, opts)` function that
 * transparently routes calls to either the real FastAPI backend (when
 * VITE_USE_MOCK=false) or the in-memory mock engine (when true).
 *
 * The mock engine is rich enough to drive the entire UI: 3 parking lots,
 * ~60 slots, 5 seeded users, booking lifecycle, fine engine, clock sync,
 * audit log, and the Hard Block rule. State is held inside this module and
 * mutated through `applyEvent(...)` so WebSocket payloads stay consistent.
 *
 * Consumers should always import the named functions (e.g. `api.listSlots()`,
 * `api.reserve(...)`) — they handle the JSON envelope uniformly.
 */

import config from '@/config'
import { useClockStore } from '@/store/clockStore'

/* ========================================================================
 * IN-MEMORY MOCK BACKEND
 * ====================================================================== */

// ---------- helpers ----------
const clone = (x) => JSON.parse(JSON.stringify(x))
const now = () => Date.now()
const pad = (n) => String(n).padStart(2, '0')
const fmtClock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const isoFromDate = (d) => new Date(d).toISOString()
const uid = () => Math.floor(Math.random() * 1_000_000) + 1
const laterMs = (ms) => new Date(Date.now() + ms).toISOString()

// ---------- seeded lots ----------
const seedLots = [
  { id: 1, name: 'Lot A — North Wing', location: 'Academic Block', total_slots: 20, is_active: true },
  { id: 2, name: 'Lot B — Engineering', location: 'Engineering Block', total_slots: 20, is_active: true },
  { id: 3, name: 'Lot C — Sports Complex', location: 'Sports Block', total_slots: 20, is_active: true },
]

// 60 slots across the three lots. Mix of car/bike/ev/handicap.
function seedSlots() {
  const out = []
  let id = 1
  for (const lot of seedLots) {
    const prefix = lot.name.split(' ')[1] // A, B, C
    for (let i = 1; i <= lot.total_slots; i++) {
      const slot_number = `${prefix}-${String(i).padStart(2, '0')}`
      let slot_type = 'car'
      if (i % 6 === 0) slot_type = 'bike'
      else if (i % 11 === 0) slot_type = 'ev'
      else if (i === 7 || i === 14) slot_type = 'handicap'
      out.push({
        id: id++,
        lot_id: lot.id,
        slot_number,
        slot_type,
        status: 'AVAILABLE',
        current_booking_id: null,
        vehicle_plate: null,
      })
    }
  }
  return out
}

// ---------- seeded users (mirrors authStore.demoUsers) ----------
const seedUsers = [
  { id: 1, name: 'Ananya Sharma', roll_number: 'CSE2024-031', email: 'student.good@campus.edu', vehicle_plate: 'KA-05-HH-2241', phone_number: '+91 90000 11122', unpaid_fine_total: 0, is_flagged: false, role: 'student', password: 'demo' },
  { id: 2, name: 'Rahul Verma', roll_number: 'ECE2023-118', email: 'student.fined@campus.edu', vehicle_plate: 'KA-05-AB-7732', phone_number: '+91 90000 33455', unpaid_fine_total: 400, is_flagged: false, role: 'student', password: 'demo' },
  { id: 3, name: 'Priya Iyer', roll_number: 'ME2022-007', email: 'student.flagged@campus.edu', vehicle_plate: 'KA-05-EF-9911', phone_number: '+91 90000 77889', unpaid_fine_total: 1200, is_flagged: true, role: 'student', password: 'demo' },
  { id: 10, name: 'Vikram Singh', roll_number: 'STAFF-014', email: 'guard.lota@campus.edu', vehicle_plate: 'CAMPUS-014', phone_number: '+91 90000 55001', unpaid_fine_total: 0, is_flagged: false, role: 'guard', password: 'demo' },
  { id: 100, name: 'Dr. Kavita Rao', roll_number: 'ADMIN-001', email: 'admin@campus.edu', vehicle_plate: 'ADMIN-001', phone_number: '+91 90000 99001', unpaid_fine_total: 0, is_flagged: false, role: 'admin', password: 'demo' },
]

// ---------- mock DB ----------
const db = {
  users: clone(seedUsers),
  lots: clone(seedLots),
  slots: seedSlots(),
  bookings: [],
  fines: [
    // Pre-existing unpaid fine for the "fined" demo student
    {
      id: 5001,
      booking_id: 9001,
      student_id: 2,
      amount: 400,
      reason: 'OVERSTAY',
      status: 'unpaid',
      issued_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      paid_at: null,
      days_overdue: 0,
      description: 'Overstayed Shift 1 by 2 hours (Lot A-12)',
    },
  ],
  audit: [],
}

// seed audit history
for (let i = 0; i < 8; i++) {
  db.audit.push({
    id: 7000 + i,
    timestamp: new Date(Date.now() - (i + 1) * 1000 * 60 * 13).toISOString(),
    actor_id: 100,
    actor_role: 'admin',
    action: i % 2 ? 'CLOCK_SPEED_CHANGE' : 'LOT_MAINTENANCE',
    severity: 'info',
    details: i % 2 ? 'Speed multiplier set to 5x for overstay demo' : 'Lot B marked under maintenance',
  })
}

// ---------- current session ----------
function readStoredSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('plms.auth.session')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.state?.token) {
          return { token: parsed.state.token, user: parsed.state.user || null }
        }
      }
    }
  } catch {}
  return { token: null, user: null }
}

let session = readStoredSession()

export function getSession() {
  if (!session.token) {
    session = readStoredSession()
  }
  return session
}

/* ========================================================================
 * Fine engine (in-memory mirror of backend logic)
 * ====================================================================== */

function resolveShiftFor(date) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes >= 9 * 60 && minutes < 12 * 60 + 30) return { shift: 'SHIFT_1', start: 9 * 60, end: 12 * 60 + 30, graceEnd: 12 * 60 + 45 }
  if (minutes >= 12 * 60 + 30 && minutes < 14 * 60) return { shift: 'MIDDAY_CLOSED', start: 12 * 60 + 30, end: 14 * 60 }
  if (minutes >= 14 * 60 && minutes < 17 * 60 + 30) return { shift: 'SHIFT_2', start: 14 * 60, end: 17 * 60 + 30, graceEnd: 17 * 60 + 45 }
  return { shift: 'OFF_HOURS', start: 17 * 60 + 30, end: 9 * 60 }
}

function overstayFineAmount(overstayMs) {
  if (overstayMs <= 0) return 0
  const hours = Math.ceil(overstayMs / (1000 * 60 * 60))
  return hours * config.fine.hourlyRate
}

function latePenaltyFor(fine) {
  if (fine.status === 'paid') return 0
  const ageMs = now() - new Date(fine.issued_at).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays <= 7) return 0
  const overdueDays = Math.floor(ageDays - 7)
  fine.days_overdue = overdueDays
  return overdueDays * config.fine.latePenaltyPerDay
}

function recomputeStudentFines(studentId) {
  const student = db.users.find((u) => u.id === studentId)
  if (!student) return
  let total = 0
  for (const fine of db.fines) {
    if (fine.student_id !== studentId) continue
    const penalty = latePenaltyFor(fine)
    fine.amount = (fine.base_amount || fine.amount) + penalty
    if (fine.status === 'unpaid') total += fine.amount
  }
  student.unpaid_fine_total = total
  student.is_flagged = total >= config.fine.flagThreshold
}

/* ========================================================================
 * Event bus — bridges mock mutations to WebSocket listeners.
 * ====================================================================== */
const listeners = new Set()
export function subscribeMockEvents(handler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}
function emit(event) {
  for (const l of listeners) l(event)
}

export function applyEvent(event) {
  if (!event) return
  // SLOT_UPDATED — synchronize mock slot state to a broadcast update
  if (event.type === 'SLOT_UPDATED' && event.slot) {
    const s = db.slots.find((x) => x.id === event.slot.id)
    if (s) Object.assign(s, event.slot)
  }
  // FINE_ISSUED
  if (event.type === 'FINE_ISSUED' && event.fine) {
    const existing = db.fines.find((f) => f.id === event.fine.id)
    if (!existing) db.fines.push(event.fine)
    recomputeStudentFines(event.fine.student_id)
  }
  // CLOCK_TICK
  if (event.type === 'CLOCK_TICK') {
    // No mutation needed; clock store reads the payload separately.
  }
}

/* ========================================================================
 * Real REST fetch wrapper (used when VITE_USE_MOCK === false)
 * ====================================================================== */
async function realFetch(path, opts = {}) {
  const currentSession = getSession()
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  if (currentSession.token) headers.Authorization = `Bearer ${currentSession.token}`
  const res = await fetch(`${config.apiBase}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    let detail
    try {
      detail = await res.json()
    } catch {
      detail = { detail: res.statusText }
    }
    const err = new Error(detail.detail || res.statusText)
    err.status = res.status
    err.detail = detail

    // If 401 Unauthorized, automatically purge invalid/stale session and redirect to /login
    if (res.status === 401) {
      session = { token: null, user: null }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('plms.auth.session')
        }
        // Force Zustand state reset to ensure RequireAuth unmounts components
        const authStore = require('@/store/authStore').useAuthStore
        if (authStore && authStore.getState) {
          authStore.getState().logout()
        }
      } catch (e) {
        console.warn('Failed to clear Zustand state', e)
      }
      
      // Prevent rapid redirect loops if multiple requests fail at once
      if (!window.__isLoggingOut && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.__isLoggingOut = true
        window.location.href = '/login'
      }
      
      const e = new Error('login required')
      e.status = 401
      throw e
    }
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

/* ========================================================================
 * Mock request router
 * ====================================================================== */

function delay(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireSession() {
  const s = getSession()
  if (!s.user) {
    const err = new Error('Not authenticated')
    err.status = 401
    throw err
  }
  return s.user
}

function requireRole(...roles) {
  const user = requireSession()
  if (!roles.includes(user.role)) {
    const err = new Error('Forbidden')
    err.status = 403
    throw err
  }
  return user
}

function logAudit({ actor_id, actor_role, action, severity = 'info', details }) {
  db.audit.unshift({
    id: uid(),
    timestamp: new Date().toISOString(),
    actor_id,
    actor_role,
    action,
    severity,
    details,
  })
  // keep at most 200 entries
  if (db.audit.length > 200) db.audit.length = 200
  emit({ type: 'AUDIT', entry: db.audit[0] })
}

const routes = {
  /* ---------------- Auth ---------------- */
  'POST /auth/login': async ({ body }) => {
    const id = (body.identifier || '').toLowerCase().trim()
    const user = db.users.find(
      (u) => u.email.toLowerCase() === id || u.roll_number.toLowerCase() === id,
    )
    if (!user || body.password !== 'demo') {
      const err = new Error('Invalid credentials')
      err.status = 401
      throw err
    }
    const token = `mock.${user.role}.${user.id}.${Date.now()}`
    session = { token, user }
    logAudit({ actor_id: user.id, actor_role: user.role, action: 'LOGIN', details: `Signed in as ${user.role}` })
    return { token, user: stripUser(user) }
  },
  'POST /auth/demo-login': async ({ body }) => {
    const u = db.users.find((x) => x.email === body.email)
    if (!u) {
      const err = new Error('Demo user not found')
      err.status = 404
      throw err
    }
    const token = `mock.${u.role}.${u.id}.${Date.now()}`
    session = { token, user: u }
    logAudit({ actor_id: u.id, actor_role: u.role, action: 'LOGIN_DEMO', details: `Demo switch to ${u.role}` })
    return { token, user: stripUser(u) }
  },
  'POST /auth/logout': async () => {
    session = { token: null, user: null }
    return { ok: true }
  },
  'GET /auth/me': async () => {
    const u = requireSession()
    recomputeStudentFines(u.id)
    return stripUser(db.users.find((x) => x.id === u.id))
  },

  /* ---------------- Lots & Slots ---------------- */
  'GET /lots': async () => clone(db.lots),
  'GET /slots': async ({ query }) => {
    let list = clone(db.slots)
    if (query?.lot_id) list = list.filter((s) => s.lot_id === Number(query.lot_id))
    if (query?.slot_type) list = list.filter((s) => s.slot_type === query.slot_type)
    if (query?.status) list = list.filter((s) => s.status === query.status)
    return list
  },

  /* ---------------- Student: bookings ---------------- */
  'POST /student/reserve': async ({ body }) => {
    const u = requireRole('student')
    recomputeStudentFines(u.id)
    const fresh = db.users.find((x) => x.id === u.id)
    // Hard block
    if (fresh.unpaid_fine_total > 0 || fresh.is_flagged) {
      logAudit({ actor_id: u.id, actor_role: 'student', action: 'HARD_BLOCK', severity: 'warning', details: `Tried to reserve slot ${body.slot_id} with ₹${fresh.unpaid_fine_total} unpaid` })
      const err = new Error(`HARD_BLOCK: Outstanding unpaid fines of ₹${fresh.unpaid_fine_total} must be cleared before booking.`)
      err.status = 403
      err.detail = { unpaid_fine_total: fresh.unpaid_fine_total, is_flagged: fresh.is_flagged }
      throw err
    }
    const slot = db.slots.find((s) => s.id === Number(body.slot_id))
    if (!slot) {
      const err = new Error('Slot not found')
      err.status = 404
      throw err
    }
    if (slot.status !== 'AVAILABLE') {
      const err = new Error(`Slot is ${slot.status}`)
      err.status = 409
      throw err
    }
    const virtualNow = readVirtualNow()
    const shift = resolveShiftFor(virtualNow)
    if (shift.shift !== 'SHIFT_1' && shift.shift !== 'SHIFT_2') {
      const err = new Error('Outside booking hours — open during SHIFT_1 / SHIFT_2 only.')
      err.status = 409
      throw err
    }
    // Create booking
    const booking = {
      id: uid(),
      student_id: u.id,
      slot_id: slot.id,
      shift: shift.shift,
      status: 'booked',
      vehicle_plate: fresh.vehicle_plate,
      booked_at: new Date().toISOString(),
      parked_at: null,
      left_at: null,
      expected_exit_at: new Date(virtualNow.getTime() + (shift.end - shift.start) * 60 * 1000).toISOString(),
      fine_amount: 0,
    }
    db.bookings.push(booking)
    slot.status = 'BOOKED'
    slot.current_booking_id = booking.id
    logAudit({ actor_id: u.id, actor_role: 'student', action: 'BOOK', details: `Reserved ${slot.slot_number} for ${shift.shift}` })
    emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    return clone(booking)
  },

  'POST /student/cancel': async ({ body }) => {
    const u = requireRole('student')
    const booking = db.bookings.find((b) => b.id === Number(body.booking_id) && b.student_id === u.id)
    if (!booking) {
      const err = new Error('Booking not found')
      err.status = 404
      throw err
    }
    if (booking.status !== 'booked') {
      const err = new Error('Cannot cancel after parking')
      err.status = 409
      throw err
    }
    booking.status = 'cancelled'
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (slot) {
      slot.status = 'AVAILABLE'
      slot.current_booking_id = null
      slot.vehicle_plate = null
      emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    }
    logAudit({ actor_id: u.id, actor_role: 'student', action: 'CANCEL', details: `Cancelled booking ${booking.id}` })
    return clone(booking)
  },

  'POST /student/park': async ({ body }) => {
    const u = requireRole('student')
    const booking = db.bookings.find((b) => b.id === Number(body.booking_id) && b.student_id === u.id)
    if (!booking) {
      const err = new Error('Booking not found')
      err.status = 404
      throw err
    }
    if (booking.status !== 'booked') {
      const err = new Error(`Cannot park — booking is ${booking.status}`)
      err.status = 409
      throw err
    }
    booking.status = 'parked'
    booking.parked_at = new Date().toISOString()
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (slot) {
      slot.status = 'PARKED'
      slot.vehicle_plate = booking.vehicle_plate
      emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    }
    logAudit({ actor_id: u.id, actor_role: 'student', action: 'STUDENT_PARKED', details: `${u.name} parked vehicle at ${slot?.slot_number}` })
    return clone(booking)
  },

  'POST /student/leave': async ({ body }) => {
    const u = requireRole('student')
    const booking = db.bookings.find((b) => b.id === Number(body.booking_id) && b.student_id === u.id)
    if (!booking) {
      const err = new Error('Booking not found')
      err.status = 404
      throw err
    }
    if (!['parked', 'overstay'].includes(booking.status)) {
      const err = new Error(`Cannot leave — booking is ${booking.status}`)
      err.status = 409
      throw err
    }
    const wasOverstay = booking.status === 'overstay'
    booking.status = 'completed'
    booking.left_at = new Date().toISOString()
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (slot) {
      slot.status = 'AVAILABLE'
      slot.current_booking_id = null
      slot.vehicle_plate = null
      emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    }
    logAudit({ actor_id: u.id, actor_role: 'student', action: 'STUDENT_LEFT', details: `${u.name} vacated bay at ${slot?.slot_number}${wasOverstay ? ' (was overstay)' : ''}` })
    return clone(booking)
  },

  'GET /student/bookings': async () => {
    const u = requireRole('student')
    return clone(db.bookings.filter((b) => b.student_id === u.id)).sort(
      (a, b) => new Date(b.booked_at) - new Date(a.booked_at),
    )
  },

  'GET /student/active-booking': async () => {
    const u = requireRole('student')
    const b = db.bookings.find(
      (b) => b.student_id === u.id && ['booked', 'parked', 'overstay'].includes(b.status),
    )
    return b ? clone(b) : null
  },

  'GET /student/fines': async () => {
    const u = requireRole('student')
    recomputeStudentFines(u.id)
    return clone(db.fines.filter((f) => f.student_id === u.id)).sort(
      (a, b) => new Date(b.issued_at) - new Date(a.issued_at),
    )
  },

  'POST /student/fines/:id/pay': async ({ params }) => {
    const u = requireRole('student')
    const fine = db.fines.find((f) => f.id === Number(params.id) && f.student_id === u.id)
    if (!fine) {
      const err = new Error('Fine not found')
      err.status = 404
      throw err
    }
    if (fine.status === 'paid') return clone(fine)
    fine.status = 'paid'
    fine.paid_at = new Date().toISOString()
    recomputeStudentFines(u.id)
    const student = db.users.find((x) => x.id === u.id)
    logAudit({ actor_id: u.id, actor_role: 'student', action: 'FINE_PAID', details: `Paid ₹${fine.amount} (${fine.reason})` })
    emit({ type: 'FINE_SETTLED', student: stripUser(student), fine: clone(fine) })
    return clone(fine)
  },

  'POST /student/pay-all': async () => {
    const u = requireRole('student')
    let total = 0
    for (const fine of db.fines) {
      if (fine.student_id !== u.id || fine.status === 'paid') continue
      fine.status = 'paid'
      fine.paid_at = new Date().toISOString()
      total += fine.amount
    }
    recomputeStudentFines(u.id)
    const student = db.users.find((x) => x.id === u.id)
    logAudit({ actor_id: u.id, actor_role: 'student', action: 'FINE_PAID_ALL', details: `Paid all fines — ₹${total}` })
    return { ok: true, total_paid: total, user: stripUser(student) }
  },

  /* ---------------- Guard ---------------- */
  'GET /guard/lookup': async ({ query }) => {
    requireRole('guard', 'admin')
    const plate = (query.plate || '').toUpperCase().trim()
    if (!plate) return null
    // Look up active booking first
    const booking = db.bookings.find((b) => b.vehicle_plate?.toUpperCase() === plate && ['booked', 'parked', 'overstay'].includes(b.status))
    if (booking) {
      const slot = db.slots.find((s) => s.id === booking.slot_id)
      const student = db.users.find((u) => u.id === booking.student_id)
      return {
        booking: clone(booking),
        slot: clone(slot),
        student: student ? stripUser(student) : null,
      }
    }
    // Otherwise find user record by plate
    const student = db.users.find((u) => u.vehicle_plate?.toUpperCase() === plate)
    return student ? { student: stripUser(student) } : null
  },

  'POST /guard/check-in': async ({ body }) => {
    const u = requireRole('guard', 'admin')
    const booking = db.bookings.find((b) => b.id === Number(body.booking_id))
    if (!booking) {
      const err = new Error('Booking not found')
      err.status = 404
      throw err
    }
    if (booking.status !== 'booked') {
      const err = new Error('Booking is not in a checkable-in state')
      err.status = 409
      throw err
    }
    booking.status = 'parked'
    booking.parked_at = new Date().toISOString()
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (slot) {
      slot.status = 'PARKED'
      slot.vehicle_plate = booking.vehicle_plate
      emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    }
    logAudit({ actor_id: u.id, actor_role: u.role, action: 'CHECK_IN', details: `Vehicle ${booking.vehicle_plate} checked in at ${slot?.slot_number}` })
    return clone(booking)
  },

  'POST /guard/check-out': async ({ body }) => {
    const u = requireRole('guard', 'admin')
    const booking = db.bookings.find((b) => b.id === Number(body.booking_id))
    if (!booking) {
      const err = new Error('Booking not found')
      err.status = 404
      throw err
    }
    if (!['parked', 'overstay'].includes(booking.status)) {
      const err = new Error('Booking is not parked')
      err.status = 409
      throw err
    }
    const wasOverstay = booking.status === 'overstay'
    booking.status = 'completed'
    booking.left_at = new Date().toISOString()
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (slot) {
      slot.status = 'AVAILABLE'
      slot.current_booking_id = null
      slot.vehicle_plate = null
      emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    }
    logAudit({ actor_id: u.id, actor_role: u.role, action: 'CHECK_OUT', details: `Vehicle ${booking.vehicle_plate} departed from ${slot?.slot_number}${wasOverstay ? ' (was overstay)' : ''}` })
    return clone(booking)
  },

  'POST /guard/report-overstay': async ({ body }) => {
    const u = requireRole('guard', 'admin')
    const booking = db.bookings.find((b) => b.id === Number(body.booking_id))
    if (!booking) {
      const err = new Error('Booking not found')
      err.status = 404
      throw err
    }
    // Force-fine the booking immediately
    issueOverstayFine(booking)
    logAudit({ actor_id: u.id, actor_role: u.role, action: 'OVERSTAY_REPORTED', severity: 'warning', details: `Guard issued manual overstay fine for booking ${booking.id}` })
    return clone(booking)
  },

  /* ---------------- Admin ---------------- */
  'GET /admin/metrics': async () => {
    requireRole('admin')
    const totalSlots = db.slots.length
    const occupied = db.slots.filter((s) => ['PARKED', 'BOOKED', 'OVERSTAY'].includes(s.status)).length
    const overstays = db.slots.filter((s) => s.status === 'OVERSTAY').length
    const totalCollected = db.fines.filter((f) => f.status === 'paid').reduce((a, b) => a + b.amount, 0)
    const totalOutstanding = db.fines.filter((f) => f.status === 'unpaid').reduce((a, b) => a + b.amount, 0)
    const flaggedStudents = db.users.filter((u) => u.role === 'student' && u.is_flagged).length
    return {
      totalSlots,
      occupied,
      available: totalSlots - occupied,
      overstays,
      totalCollected,
      totalOutstanding,
      flaggedStudents,
      lots: db.lots.length,
    }
  },

  'GET /admin/audit': async () => {
    requireRole('admin')
    return clone(db.audit)
  },

  'GET /admin/flagged': async () => {
    requireRole('admin')
    return clone(db.users.filter((u) => u.role === 'student' && u.is_flagged)).map(stripUser)
  },

  'GET /admin/students': async () => {
    requireRole('admin')
    return clone(db.users.filter((u) => u.role === 'student')).map((u) => {
      recomputeStudentFines(u.id)
      return stripUser(db.users.find((x) => x.id === u.id))
    })
  },

  'POST /admin/slots/:id/maintenance': async ({ params, body }) => {
    requireRole('admin')
    const slot = db.slots.find((s) => String(s.id) === String(params.id))
    if (!slot) {
      const err = new Error('Slot not found')
      err.status = 404
      throw err
    }
    const targetStatus = body.status ? body.status.toUpperCase() : (body.on ? 'MAINTENANCE' : 'AVAILABLE')
    slot.status = targetStatus
    if (['AVAILABLE', 'MAINTENANCE', 'CLOSED', 'BLOCKED'].includes(targetStatus)) {
      slot.current_booking_id = null
      slot.vehicle_plate = null
      const b = db.bookings.find((x) => String(x.slot_id) === String(slot.id) && ['booked', 'parked', 'overstay'].includes(x.status))
      if (b) b.status = 'cancelled'
    } else if (targetStatus === 'PARKED') {
      if (!slot.vehicle_plate) slot.vehicle_plate = body.vehicle_plate || 'ADMIN-HOLD'
    }
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'SLOT_MAINTENANCE', details: `${slot.slot_number} → ${slot.status}` })
    emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    return clone(slot)
  },

  'POST /admin/slots/:id/status': async ({ params, body }) => {
    requireRole('admin')
    const slot = db.slots.find((s) => String(s.id) === String(params.id))
    if (!slot) {
      const err = new Error('Slot not found')
      err.status = 404
      throw err
    }
    const raw = (body.status || body.override_status || 'AVAILABLE').toUpperCase()
    const targetStatus = raw === 'BLOCKED' ? 'CLOSED' : raw
    slot.status = targetStatus
    if (['AVAILABLE', 'MAINTENANCE', 'CLOSED'].includes(targetStatus)) {
      slot.current_booking_id = null
      slot.vehicle_plate = null
      const b = db.bookings.find((x) => String(x.slot_id) === String(slot.id) && ['booked', 'parked', 'overstay'].includes(x.status))
      if (b) b.status = 'cancelled'
    } else if (targetStatus === 'PARKED') {
      if (!slot.vehicle_plate) slot.vehicle_plate = body.vehicle_plate || 'ADMIN-HOLD'
    }
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'SLOT_STATUS_OVERRIDE', details: `${slot.slot_number} → ${slot.status}` })
    emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    return clone(slot)
  },

  'POST /admin/slots/:id/override': async ({ params, body }) => {
    requireRole('admin')
    const slot = db.slots.find((s) => String(s.id) === String(params.id))
    if (!slot) {
      const err = new Error('Slot not found')
      err.status = 404
      throw err
    }
    const raw = (body.status || body.override_status || 'AVAILABLE').toUpperCase()
    const targetStatus = raw === 'BLOCKED' ? 'CLOSED' : raw
    slot.status = targetStatus
    if (['AVAILABLE', 'MAINTENANCE', 'CLOSED'].includes(targetStatus)) {
      slot.current_booking_id = null
      slot.vehicle_plate = null
      const b = db.bookings.find((x) => String(x.slot_id) === String(slot.id) && ['booked', 'parked', 'overstay'].includes(x.status))
      if (b) b.status = 'cancelled'
    }
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'SLOT_STATUS_OVERRIDE', details: `${slot.slot_number} → ${slot.status}` })
    emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
    return clone(slot)
  },

  /* ---------------- Clock ---------------- */
  'GET /clock': async () => {
    const v = readVirtualNow()
    return {
      virtual_time: v.toISOString(),
      speed: readSpeed(),
      shift: resolveShiftFor(v).shift,
      display: fmtClock(v),
    }
  },
  'POST /clock/speed': async ({ body }) => {
    requireRole('admin')
    const speed = Number(body.speed) || 1
    virtualClock.speed = speed
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'CLOCK_SPEED', details: `Speed set to ${speed}x` })
    emit({ type: 'CLOCK_TICK', virtual_time: readVirtualNow().toISOString(), speed, shift: resolveShiftFor(readVirtualNow()).shift })
    return { speed }
  },
  'POST /clock/jump': async ({ body }) => {
    requireRole('admin')
    const minutes = Number(body.minutes || 0)
    virtualClock.jump(minutes * 60 * 1000)
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'CLOCK_JUMP', details: `Jumped ${minutes} min` })
    emit({ type: 'CLOCK_TICK', virtual_time: readVirtualNow().toISOString(), speed: virtualClock.speed, shift: resolveShiftFor(readVirtualNow()).shift })
    return { virtual_time: readVirtualNow().toISOString() }
  },
  'POST /clock/set': async ({ body }) => {
    requireRole('admin')
    const target = new Date(body.virtual_time)
    if (Number.isNaN(target.getTime())) {
      const err = new Error('Invalid date')
      err.status = 400
      throw err
    }
    virtualClock.baseVirtual = target.getTime()
    virtualClock.baseReal = Date.now()
    virtualClock.manualOffset = 0
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'CLOCK_SET', details: `Set to ${target.toISOString()}` })
    emit({ type: 'CLOCK_TICK', virtual_time: target.toISOString(), speed: virtualClock.speed, shift: resolveShiftFor(target).shift })
    return { virtual_time: target.toISOString() }
  },
  'POST /clock/reset': async () => {
    requireRole('admin')
    virtualClock.speed = 1
    virtualClock.manualOffset = 0
    virtualClock.baseVirtual = Date.now()
    virtualClock.baseReal = Date.now()
    logAudit({ actor_id: session.user.id, actor_role: 'admin', action: 'CLOCK_RESET', details: `Reset to real time` })
    return { ok: true }
  },
}

/* ========================================================================
 * Pure virtual clock for the mock — decoupled from the React clock store
 * so the api mock can issue shifts independently. Both stores are kept in
 * sync via periodic broadcast in services/websocket.js.
 * ====================================================================== */
const virtualClock = {
  baseReal: Date.now(),
  baseVirtual: Date.now(),
  manualOffset: 0,
  speed: 1,
}
function readVirtualNow() {
  return new Date(
    virtualClock.baseVirtual + virtualClock.manualOffset + (Date.now() - virtualClock.baseReal) * virtualClock.speed,
  )
}
function readSpeed() {
  return virtualClock.speed
}
function jumpBy(ms) {
  virtualClock.manualOffset += ms
}

/* ========================================================================
 * Overstay sweep — called periodically by services/websocket.js
 * Detects any booking past its shift grace period and issues a fine,
 * transitions the slot into OVERSTAY, and emits SLOT_UPDATED/FINE_ISSUED.
 * ====================================================================== */
let lastSweepAt = 0
export function runOverstaySweep() {
  const nowMs = Date.now()
  if (nowMs - lastSweepAt < 500) return // throttle
  lastSweepAt = nowMs

  const v = readVirtualNow()
  for (const booking of db.bookings) {
    if (!['booked', 'parked', 'overstay'].includes(booking.status)) continue
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (!slot) continue
    const shift = booking.shift === 'SHIFT_1'
      ? { graceEnd: (() => { const d = new Date(v); d.setHours(12, 45, 0, 0); return d })() }
      : { graceEnd: (() => { const d = new Date(v); d.setHours(17, 45, 0, 0); return d })() }
    const expected = shift.graceEnd.getTime()
    // Translate the booking's expected_exit_at by comparing virtual vs real
    const expectedVirtual = new Date(booking.expected_exit_at).getTime()
    // virtual elapsed since booking
    const virtualBookedAt = (() => {
      const realBookedAt = new Date(booking.booked_at).getTime()
      const offset = virtualClock.manualOffset + (realBookedAt - virtualClock.baseReal) * virtualClock.speed
      return virtualClock.baseVirtual + offset
    })()
    // Use the booking's *virtual* expected exit (shift-end in virtual time)
    const overstayMs = readVirtualNow().getTime() - expectedVirtual
    if (overstayMs > 0 && slot.status !== 'OVERSTAY') {
      // Transition to OVERSTAY
      slot.status = 'OVERSTAY'
      booking.status = 'overstay'
      emit({ type: 'SLOT_UPDATED', slot: clone(slot) })
      logAudit({ actor_id: booking.student_id, actor_role: 'system', action: 'OVERSTAY', severity: 'critical', details: `${slot.slot_number} entered OVERSTAY` })
    }
    if (overstayMs > 15 * 60 * 1000 && !booking.fine_issued) {
      // Issue fine once grace has expired
      issueOverstayFine(booking)
      booking.fine_issued = true
    }
    // Hold reference for clarity
    void expected
    void virtualBookedAt
  }

  // Recompute every student's outstanding totals on each sweep.
  for (const u of db.users) {
    if (u.role === 'student') recomputeStudentFines(u.id)
  }
}

function issueOverstayFine(booking) {
  const slot = db.slots.find((s) => s.id === booking.slot_id)
  if (!slot) return
  const v = readVirtualNow()
  const expectedVirtual = new Date(booking.expected_exit_at).getTime()
  const overstayMs = Math.max(0, v.getTime() - expectedVirtual)
  const hours = Math.max(1, Math.ceil(overstayMs / (1000 * 60 * 60)))
  const baseAmount = hours * config.fine.hourlyRate
  // If a fine already exists for this booking, update it instead
  const existing = db.fines.find((f) => f.booking_id === booking.id)
  if (existing) {
    existing.amount = baseAmount
    existing.base_amount = baseAmount
    recomputeStudentFines(booking.student_id)
    emit({ type: 'FINE_ISSUED', fine: clone(existing) })
    return existing
  }
  const fine = {
    id: uid(),
    booking_id: booking.id,
    student_id: booking.student_id,
    amount: baseAmount,
    base_amount: baseAmount,
    reason: 'OVERSTAY',
    status: 'unpaid',
    issued_at: new Date().toISOString(),
    paid_at: null,
    days_overdue: 0,
    description: `Overstayed ${slot.slot_number} by ${hours}h`,
  }
  db.fines.push(fine)
  booking.fine_amount = baseAmount
  recomputeStudentFines(booking.student_id)
  logAudit({ actor_id: booking.student_id, actor_role: 'system', action: 'FINE_ISSUED', severity: 'critical', details: `Fine ₹${baseAmount} (${hours}h overstay at ${slot.slot_number})` })
  emit({ type: 'FINE_ISSUED', fine: clone(fine) })
  return fine
}

/* ========================================================================
 * Helpers — strip password hash etc. when responding
 * ====================================================================== */
function stripUser(u) {
  if (!u) return u
  const { password, ...rest } = u
  return rest
}

/* ========================================================================
 * Public surface
 * ====================================================================== */
function stripPath(path) {
  return path.split('?')[0]
}

async function request(path, opts = {}) {
  if (!config.useMockBackend) {
    return realFetch(path, opts)
  }
  // MOCK path
  await delay(80)
  const url = stripPath(path)
  // Find a matching route. Supports :param syntax in keys.
  const key = Object.keys(routes).find((k) => {
    const kPath = k.split(' ')[1]
    if (kPath.includes(':')) {
      const kParts = kPath.split('/')
      const uParts = url.split('/')
      if (kParts.length !== uParts.length) return false
      return kParts.every((seg, i) => seg.startsWith(':') || seg === uParts[i])
    }
    return kPath === url
  })
  if (!key) {
    const err = new Error(`Mock route not found: ${path}`)
    err.status = 404
    throw err
  }
  // Build params + query
  const kPath = key.split(' ')[1]
  const params = {}
  const kParts = kPath.split('/')
  const uParts = url.split('/')
  kParts.forEach((seg, i) => {
    if (seg.startsWith(':')) params[seg.slice(1)] = uParts[i]
  })
  const query = {}
  if (path.includes('?')) {
    new URLSearchParams(path.split('?')[1]).forEach((v, k) => (query[k] = v))
  }
  const [method] = key.split(' ')
  return routes[key]({
    params,
    query,
    body: opts.body,
    headers: opts.headers,
  }).then((res) => {
    if (method === 'POST /clock/speed') {
      // Mirror admin clock changes into the local clock store too
      // so the UI updates immediately.
      try {
        useClockStore.getState().setSpeed(opts.body?.speed || 1)
      } catch (e) { /* ignore in non-Vite env */ }
    }
    return res
  })
}

/* ========================================================================
 * Named exports — friendly wrapper around `request`.
 * Each function mirrors the FastAPI endpoints and matches the routes above.
 * ====================================================================== */
const api = {
  setMockSession(next) {
    session = next ? { ...next } : { token: null, user: null }
  },

  // Auth
  login: (identifier, password) =>
    request('/auth/login', { method: 'POST', body: { identifier, password } }),
  demoLogin: (email) =>
    request('/auth/demo-login', { method: 'POST', body: { email } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me', { method: 'GET' }),

  // Lots + slots
  listLots: () => request('/lots', { method: 'GET' }),
  listSlots: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/slots${qs ? `?${qs}` : ''}`, { method: 'GET' })
  },

  // Student
  reserve: (slotId, shift) =>
    request('/student/reserve', { method: 'POST', body: { slot_id: slotId, shift } }),
  cancelBooking: (bookingId) =>
    request('/student/cancel', { method: 'POST', body: { booking_id: bookingId } }),
  myBookings: () => request('/student/bookings', { method: 'GET' }),
  activeBooking: () => request('/student/active-booking', { method: 'GET' }),
  myFines: () => request('/student/fines', { method: 'GET' }),
  payFine: (id) => request(`/student/fines/${id}/pay`, { method: 'POST' }),
  payAllFines: () => request('/student/pay-all', { method: 'POST' }),
  park: (bookingId) =>
    request('/student/park', { method: 'POST', body: { booking_id: bookingId } }),
  leave: (bookingId) =>
    request('/student/leave', { method: 'POST', body: { booking_id: bookingId } }),

  // Guard
  lookupPlate: (plate) =>
    request(`/guard/lookup?plate=${encodeURIComponent(plate)}`, { method: 'GET' }),
  checkIn: (bookingId) =>
    request('/guard/check-in', { method: 'POST', body: { booking_id: bookingId } }),
  checkOut: (bookingId) =>
    request('/guard/check-out', { method: 'POST', body: { booking_id: bookingId } }),
  reportOverstay: (bookingId) =>
    request('/guard/report-overstay', { method: 'POST', body: { booking_id: bookingId } }),

  // Admin
  metrics: () => request('/admin/metrics', { method: 'GET' }),
  auditLog: () => request('/admin/audit', { method: 'GET' }),
  flaggedStudents: () => request('/admin/flagged', { method: 'GET' }),
  students: () => request('/admin/students', { method: 'GET' }),
  setMaintenance: (slotId, on) =>
    request(`/admin/slots/${slotId}/maintenance`, { method: 'POST', body: { on } }),
  setSlotStatus: (slotId, status, extra = {}) =>
    request(`/admin/slots/${slotId}/status`, { method: 'POST', body: { status, ...extra } }),
  overrideSlot: (slotId, status, extra = {}) =>
    request(`/admin/slots/${slotId}/status`, { method: 'POST', body: { status, ...extra } }),

  // Clock
  getClock: () => request('/clock', { method: 'GET' }),
  setSpeed: (speed) => request('/clock/speed', { method: 'POST', body: { speed } }),
  jumpClock: (minutes) => request('/clock/jump', { method: 'POST', body: { minutes } }),
  setClock: (iso) => request('/clock/set', { method: 'POST', body: { virtual_time: iso } }),
  resetClock: () => request('/clock/reset', { method: 'POST' }),
}

export default api
export { virtualClock, jumpBy, readVirtualNow }
