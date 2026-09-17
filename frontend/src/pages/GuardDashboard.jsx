/**
 * GuardDashboard.jsx
 * --------------------------------------------------------------------------
 * The gate guard's primary workspace. Three panels:
 *   1. Fast Vehicle Processing Bar — type/scan a plate, look up the booking
 *   2. Lot Bay Grid — guard-focused view with Mark Parked / Mark Departed
 *   3. Active Overstay Alerts Queue — list of bookings past their grace
 *
 * Every action calls the api guard endpoints and pushes a toast on success.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ScanLine,
  CarFront,
  CheckCircle2,
  LogIn,
  LogOut,
  AlertOctagon,
  Search,
  Flag,
} from 'lucide-react'

import api from '@/services/api'
import { useClockStore } from '@/store/clockStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useAuthStore } from '@/store/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  Button,
  Card,
  EmptyState,
  Field,
  HazardBanner,
  Input,
  MetricCard,
  Modal,
  SlotTile,
  StatusBadge,
  tokenFor,
} from '@/components/ui'

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function GuardDashboard() {
  const user = useAuthStore((s) => s.user)
  const pushToast = useNotificationStore((s) => s.push)

  const [lots, setLots] = useState([])
  const [slots, setSlots] = useState([])
  const [plate, setPlate] = useState('')
  const [lookup, setLookup] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [activeOverstays, setActiveOverstays] = useState([])

  const refresh = useCallback(async () => {
    try {
      const [l, sl] = await Promise.all([api.listLots(), api.listSlots()])
      setLots(l)
      setSlots(sl)
      // Build overstay list from slot/booking state
      const overstaySlots = sl.filter((s) => s.status === 'OVERSTAY')
      // We don't have direct booking access — derive plate from slot
      setActiveOverstays(overstaySlots)
    } catch (err) {
      if (err.status !== 401) {
        pushToast({ title: 'Refresh failed', message: err.message, tone: 'crimson' })
      }
    }
  }, [pushToast])

  useEffect(() => {
    refresh()
  }, [refresh])

  useWebSocket((evt) => {
    if (evt.type === 'SLOT_UPDATED' && evt.slot) {
      setSlots((prev) => prev.map((s) => (s.id === evt.slot.id ? { ...s, ...evt.slot } : s)))
    }
    if (evt.type === 'FINE_ISSUED') {
      pushToast({
        title: 'Fine issued',
        message: `₹${evt.fine.amount} added to ${evt.fine.student_id === user?.id ? 'your record' : `student #${evt.fine.student_id}`}`,
        tone: 'crimson',
      })
    }
    refresh()
  })

  const onLookup = async (e) => {
    if (e) e.preventDefault()
    if (!plate.trim()) return
    setLookupLoading(true)
    try {
      const res = await api.lookupPlate(plate.trim().toUpperCase())
      setLookup(res)
      if (!res) pushToast({ title: 'No match', message: `Plate ${plate.toUpperCase()} not found`, tone: 'amber' })
    } catch (err) {
      pushToast({ title: 'Lookup failed', message: err.message, tone: 'crimson' })
    } finally {
      setLookupLoading(false)
    }
  }

  const onCheckIn = async (booking) => {
    try {
      await api.checkIn(booking.id)
      pushToast({ title: 'Checked in', message: `${booking.vehicle_plate} parked.`, tone: 'olive' })
      setLookup(null)
      setPlate('')
      refresh()
    } catch (err) {
      pushToast({ title: 'Check-in failed', message: err.message, tone: 'crimson' })
    }
  }

  const onCheckOut = async (booking) => {
    try {
      await api.checkOut(booking.id)
      pushToast({ title: 'Departed', message: `${booking.vehicle_plate} checked out.`, tone: 'olive' })
      setLookup(null)
      setPlate('')
      refresh()
    } catch (err) {
      pushToast({ title: 'Check-out failed', message: err.message, tone: 'crimson' })
    }
  }

  const onReportOverstay = async (booking) => {
    try {
      await api.reportOverstay(booking.id)
      pushToast({ title: 'Overstay reported', message: `Manual fine issued for booking ${booking.id}.`, tone: 'crimson' })
      refresh()
    } catch (err) {
      pushToast({ title: 'Report failed', message: err.message, tone: 'crimson' })
    }
  }

  // Metrics
  const occupied = slots.filter((s) => ['PARKED', 'BOOKED'].includes(s.status)).length
  const overstays = slots.filter((s) => s.status === 'OVERSTAY').length

  return (
    <div className="space-y-6">
      {/* ============================ METRICS ============================ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={CarFront} label="Vehicles On Campus" value={occupied} sublabel="Currently parked or booked" tone="olive" />
        <MetricCard icon={AlertOctagon} label="Overstays" value={overstays} sublabel="Past grace window" tone={overstays > 0 ? 'crimson' : 'olive'} />
        <MetricCard icon={CheckCircle2} label="Open Slots" value={slots.filter((s) => s.status === 'AVAILABLE').length} sublabel="Across all lots" tone="olive" />
        <MetricCard icon={Flag} label="Your Lot" value="Lot A" sublabel={user?.name || 'Guard'} tone="slateink" />
      </section>

      {/* ============================ FAST PROCESSING BAR ============================ */}
      <Card title="Fast Vehicle Processing" subtitle="Plate lookup · Check-in · Check-out" accent="olive">
        <form onSubmit={onLookup} className="flex flex-col md:flex-row gap-3 items-stretch">
          <div className="flex-1">
            <Field label="License Plate">
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="KA-05-HH-2241"
                icon={ScanLine}
                className="text-base uppercase tracking-widest"
              />
            </Field>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" icon={Search} loading={lookupLoading}>
              Lookup
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setPlate(''); setLookup(null) }}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {/* Lookup result modal */}
      <Modal
        open={!!lookup}
        onClose={() => setLookup(null)}
        title={lookup?.booking ? 'Active Booking Found' : lookup?.student ? 'Vehicle on File' : 'No Active Booking'}
        accent={lookup?.booking ? (lookup.booking.status === 'overstay' ? 'crimson' : 'olive') : 'slateink'}
      >
        {lookup ? (
          <LookupResult
            lookup={lookup}
            onCheckIn={onCheckIn}
            onCheckOut={onCheckOut}
            onReportOverstay={onReportOverstay}
            onClose={() => setLookup(null)}
          />
        ) : null}
      </Modal>

      {/* ============================ OVERSTAY QUEUE ============================ */}
      <Card title="Active Overstay Alerts" subtitle="Vehicles past 15-min grace" accent="crimson">
        {activeOverstays.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No active overstays"
            hint="When a vehicle remains parked past its grace window, it will appear here."
          />
        ) : (
          <div className="space-y-2">
            {activeOverstays.map((s) => (
              <div
                key={s.id}
                className="border-2 border-crimson-600 bg-crimson-50 p-3 flex items-center gap-3"
              >
                <span className="w-10 h-10 border-2 border-ink-900 bg-crimson-600 text-canvas-surface flex items-center justify-center">
                  <AlertOctagon className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg">{s.slot_number}</span>
                    <StatusBadge status="OVERSTAY" />
                  </div>
                  <div className="font-mono text-xs text-ink-600">
                    Plate: {s.vehicle_plate || '—'} · {lots.find((l) => String(l.id) === String(s.lot_id))?.name}
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Flag}
                  onClick={async () => {
                    // The slot may not have a booking id directly — look up the booking via /guard/lookup
                    if (!s.vehicle_plate) return
                    const res = await api.lookupPlate(s.vehicle_plate)
                    if (res?.booking) onReportOverstay(res.booking)
                  }}
                >
                  Report & Fine
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ============================ LOT BAY GRID ============================ */}
      <Card title="Live Bay Grid" subtitle="Direct guard actions" accent="slateink">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {slots.map((s) => (
            <GuardSlotTile
              key={s.id}
              slot={s}
              onCheckIn={async () => {
                if (!s.vehicle_plate) return
                const res = await api.lookupPlate(s.vehicle_plate)
                if (res?.booking) onCheckIn(res.booking)
              }}
              onCheckOut={async () => {
                if (!s.vehicle_plate) return
                const res = await api.lookupPlate(s.vehicle_plate)
                if (res?.booking) onCheckOut(res.booking)
              }}
            />
          ))}
        </div>

        <div className="mt-4 pt-4 border-t-2 border-ink-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[10px] uppercase tracking-widest font-bold">
          {['AVAILABLE', 'BOOKED', 'PARKED', 'OVERSTAY', 'CLOSED', 'MAINTENANCE'].map((s) => {
            const t = tokenFor(s)
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 border-2 border-ink-900 ${s === 'AVAILABLE' ? 'bg-olive-600' : s === 'BOOKED' ? 'bg-amber-600' : s === 'PARKED' ? 'bg-slateink-600' : s === 'OVERSTAY' ? 'bg-crimson-600' : s === 'CLOSED' ? 'bg-slateink-600' : 'bg-amber-600'}`} />
                {t.label}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function GuardSlotTile({ slot, onCheckIn, onCheckOut }) {
  const token = tokenFor(slot.status)
  const Icon = token.icon
  const isOverstay = slot.status === 'OVERSTAY'
  const animate = isOverstay ? 'animate-pulse-hazard' : ''

  return (
    <div className={`relative card-hard p-3 min-h-[140px] ${animate}`}>
      <div className="absolute top-1.5 right-1.5 stamp bg-ink-900 text-canvas-surface">
        {token.stamp}
      </div>
      <div className="font-mono text-lg font-bold tracking-tight">{slot.slot_number}</div>
      <div className="text-[10px] uppercase tracking-widest text-ink-600">{slot.slot_type}</div>

      {slot.vehicle_plate ? (
        <div className="mt-2 font-mono text-xs text-ink-900 truncate">{slot.vehicle_plate}</div>
      ) : (
        <div className="mt-2 text-[10px] uppercase tracking-widest text-ink-400">— vacant —</div>
      )}

      {isOverstay ? (
        <div className="absolute inset-0 pointer-events-none border-2 border-crimson-600">
          <div className="absolute inset-0 hazard-stripe-crimson opacity-25 animate-hazard-stripes" />
        </div>
      ) : null}

      <div className="absolute bottom-2 left-2 right-2 flex gap-1.5">
        {slot.status === 'BOOKED' ? (
          <Button variant="primary" size="sm" icon={LogIn} onClick={onCheckIn} className="flex-1 justify-center">
            Park
          </Button>
        ) : null}
        {slot.status === 'PARKED' || slot.status === 'OVERSTAY' ? (
          <Button variant="warning" size="sm" icon={LogOut} onClick={onCheckOut} className="flex-1 justify-center">
            Depart
          </Button>
        ) : null}
        {slot.status === 'AVAILABLE' ? (
          <span className="text-[10px] uppercase tracking-widest text-ink-400 inline-flex items-center gap-1">
            <Icon className="w-3 h-3" /> Open
          </span>
        ) : null}
      </div>
    </div>
  )
}

function LookupResult({ lookup, onCheckIn, onCheckOut, onReportOverstay, onClose }) {
  if (!lookup.booking && lookup.student) {
    return (
      <div className="space-y-4">
        <HazardBanner tone="amber">
          We found the vehicle on file but it has no active booking. The driver must reserve a slot
          before parking.
        </HazardBanner>
        <div className="bg-canvas border-2 border-ink-900 p-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Info label="Driver" value={lookup.student.name} />
            <Info label="Plate" value={lookup.student.vehicle_plate} />
            <Info label="Roll No" value={lookup.student.roll_number} />
            <Info label="Fines" value={fmtMoney(lookup.student.unpaid_fine_total)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const { booking, slot, student } = lookup
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Info label="Slot" value={slot?.slot_number || '—'} mono />
        <Info label="Status" value={<StatusBadge status={booking.status} />} />
        <Info label="Driver" value={student?.name || '—'} />
        <Info label="Plate" value={booking.vehicle_plate} mono />
        <Info label="Shift" value={booking.shift.replace('_', ' ')} />
        <Info label="Booked" value={new Date(booking.booked_at).toLocaleString()} />
      </div>

      {booking.status === 'booked' ? (
        <HazardBanner tone="olive">
          Reservation is active and the driver is expected. Mark the vehicle as parked to start the
          grace clock.
        </HazardBanner>
      ) : null}
      {booking.status === 'parked' ? (
        <HazardBanner tone="amber">
          Vehicle is parked. Monitor the grace window — it ends at shift + 15 minutes.
        </HazardBanner>
      ) : null}
      {booking.status === 'overstay' ? (
        <HazardBanner tone="crimson" icon={AlertOctagon}>
          This vehicle is in OVERSTAY. Issue a manual fine or wait for the auto-engine to catch up.
        </HazardBanner>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        {booking.status === 'booked' ? (
          <Button variant="primary" icon={LogIn} onClick={() => onCheckIn(booking)}>
            Mark Parked
          </Button>
        ) : null}
        {['parked', 'overstay'].includes(booking.status) ? (
          <Button variant="warning" icon={LogOut} onClick={() => onCheckOut(booking)}>
            Mark Departed
          </Button>
        ) : null}
        {['parked', 'overstay'].includes(booking.status) ? (
          <Button variant="danger" icon={Flag} onClick={() => onReportOverstay(booking)}>
            Report & Fine
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Info({ label, value, mono = false }) {
  return (
    <div>
      <div className="label-hard">{label}</div>
      <div className={`${mono ? 'font-mono' : ''} text-sm font-bold`}>{value}</div>
    </div>
  )
}
