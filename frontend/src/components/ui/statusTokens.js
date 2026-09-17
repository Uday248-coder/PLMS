/**
 * statusTokens.js
 * --------------------------------------------------------------------------
 * Single source of truth for the visual + semantic tokens that describe a
 * parking slot's lifecycle state. The Industrial Tactile rule is "additive
 * state": never fade, hide, or blur — overlay physical badges/hazard/locks.
 *
 * Each token bundles:
 *   - label      Human-readable short string
 *   - tone       Semantic color family ('olive' | 'amber' | 'crimson' | 'slateink')
 *   - badgeBg    CSS background color used in pills/stamps
 *   - icon       Lucide icon component reference
 *   - animate    Optional Tailwind animation class (e.g. hazard pulse)
 */

import {
  CheckCircle2,
  Clock4,
  CarFront,
  AlertOctagon,
  Lock,
  Wrench,
} from 'lucide-react'

export const SLOT_STATUSES = {
  AVAILABLE: {
    key: 'AVAILABLE',
    label: 'Available',
    tone: 'olive',
    badgeBg: '#15803D',
    icon: CheckCircle2,
    stamp: 'OPEN',
    description: 'Slot is open for reservation.',
  },
  BOOKED: {
    key: 'BOOKED',
    label: 'Booked',
    tone: 'amber',
    badgeBg: '#D97706',
    icon: Clock4,
    stamp: 'HELD',
    description: 'Reserved but the vehicle has not yet arrived.',
  },
  PARKED: {
    key: 'PARKED',
    label: 'Occupied',
    tone: 'slateink',
    badgeBg: '#334155',
    icon: CarFront,
    stamp: 'PARKED',
    description: 'Vehicle has checked in and is currently parked.',
  },
  OVERSTAY: {
    key: 'OVERSTAY',
    label: 'Overstay',
    tone: 'crimson',
    badgeBg: '#DC2626',
    icon: AlertOctagon,
    stamp: 'OVERSTAY',
    description: 'Vehicle remained parked past the grace window.',
    animate: 'animate-pulse-hazard',
  },
  CLOSED: {
    key: 'CLOSED',
    label: 'Closed',
    tone: 'slateink',
    badgeBg: '#334155',
    icon: Lock,
    stamp: 'CLOSED',
    description: 'Slot is administratively closed.',
  },
  MAINTENANCE: {
    key: 'MAINTENANCE',
    label: 'Maintenance',
    tone: 'amber',
    badgeBg: '#92400E',
    icon: Wrench,
    stamp: 'SERVICE',
    description: 'Slot is offline for maintenance.',
  },
}

export const FINE_REASONS = {
  OVERSTAY: 'Overstay Penalty',
  LATE_FEE: 'Late Payment Penalty',
  UNAUTHORIZED_PARKING: 'Unauthorized Parking',
}

export const FINE_STATUSES = {
  unpaid: { label: 'Outstanding', tone: 'crimson' },
  paid: { label: 'Settled', tone: 'olive' },
}

export const SHIFT_LABELS = {
  SHIFT_1: 'Shift 1',
  SHIFT_2: 'Shift 2',
  MIDDAY_CLOSED: 'Midday Closure',
  OFF_HOURS: 'Off Hours',
}

/** Resolve a shift bucket for an arbitrary Date object. */
export function shiftForDate(d) {
  const minutes = d.getHours() * 60 + d.getMinutes()
  // 09:00 → 12:30
  if (minutes >= 9 * 60 && minutes < 12 * 60 + 30) return 'SHIFT_1'
  // 12:30 → 14:00
  if (minutes >= 12 * 60 + 30 && minutes < 14 * 60) return 'MIDDAY_CLOSED'
  // 14:00 → 17:30
  if (minutes >= 14 * 60 && minutes < 17 * 60 + 30) return 'SHIFT_2'
  return 'OFF_HOURS'
}

/** Tone utilities — convert semantic tone to Tailwind classes. */
export function toneClasses(tone) {
  switch (tone) {
    case 'olive':
      return {
        bg: 'bg-olive-600',
        text: 'text-olive-700',
        ring: 'ring-olive-600',
        border: 'border-olive-600',
        softBg: 'bg-olive-50',
      }
    case 'amber':
      return {
        bg: 'bg-amber-600',
        text: 'text-amber-700',
        ring: 'ring-amber-600',
        border: 'border-amber-600',
        softBg: 'bg-amber-50',
      }
    case 'crimson':
      return {
        bg: 'bg-crimson-600',
        text: 'text-crimson-700',
        ring: 'ring-crimson-600',
        border: 'border-crimson-600',
        softBg: 'bg-crimson-50',
      }
    case 'slateink':
      return {
        bg: 'bg-slateink-600',
        text: 'text-slateink-700',
        ring: 'ring-slateink-600',
        border: 'border-slateink-600',
        softBg: 'bg-slateink-50',
      }
    default:
      return {
        bg: 'bg-ink-900',
        text: 'text-ink-900',
        ring: 'ring-ink-900',
        border: 'border-ink-900',
        softBg: 'bg-canvas-edge',
      }
  }
}

/** Convenience: grab a slot token or fall back to a safe default. */
export function tokenFor(status) {
  return SLOT_STATUSES[status] || SLOT_STATUSES.AVAILABLE
}
