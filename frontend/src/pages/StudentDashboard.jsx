/**
 * StudentDashboard.jsx
 * --------------------------------------------------------------------------
 * The student's home base. Three primary surfaces:
 *   1. Top metrics — current fines, parked status, shift info
 *   2. Interactive lot grid — filterable slot tiles
 *   3. Active Booking Pass widget — shows current reservation and live
 *      countdown; switches to hazard mode when overstay begins.
 *
 * Implements the Hard Block rule: any click on a slot triggers the
 * Hard Block modal when `unpaid_fine_total > 0` or `is_flagged`.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  CarFront,
  AlertOctagon,
  CircleDollarSign,
  Banknote,
  TimerReset,
  ParkingCircle,
  ShieldAlert,
  Filter,
  Banknote as FineIcon,
} from 'lucide-react'

import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useClockStore, shiftLabel } from '@/store/clockStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  HazardBanner,
  MetricCard,
  Modal,
  Select,
  SlotTile,
  StatusBadge,
  ToggleGroup,
  tokenFor,
} from '@/components/ui'
import config from '@/config'

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const fmtTime = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function StudentDashboard() {
  const user = useAuthStore((s) => s.user)
  const patchUser = useAuthStore((s) => s.patchUser)
  const tick = useClockStore((s) => s.tick)
  const speed = useClockStore((s) => s.speed)
  const virtualNow = useClockStore.getState().now()
  const pushToast = useNotificationStore((s) => s.push)

  const [lots, setLots] = useState([])
  const [slots, setSlots] = useState([])
  const [activeBooking, setActiveBooking] = useState(null)
  const [loading, setLoading] = useState(true)

  const [lotFilter, setLotFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const [selectedSlot, setSelectedSlot] = useState(null)
  const [hardBlock, setHardBlock] = useState(null)
  const [payAllOpen, setPayAllOpen] = useState(false)

  // ------------- refresh -------------
  const refresh = useCallback(async () => {
    try {
      const [l, sl, ab] = await Promise.all([
        api.listLots(),
        api.listSlots(),
        api.activeBooking(),
      ])
      setLots(l)
      setSlots(sl)
      setActiveBooking(ab)
    } catch (err) {
      if (err.status !== 401) {
        pushToast({ title: 'Refresh failed', message: err.message, tone: 'crimson' })
      }
    } finally {
      setLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    refresh()
  }, [refresh])

  // refresh user fines (in case the engine sweeps while idle)
  useEffect(() => {
    api.me().then((me) => me && patchUser(me)).catch(() => {})
  }, [patchUser])

  // WebSocket: react to live changes
  useWebSocket((evt) => {
    if (evt.type === 'SLOT_UPDATED' && evt.slot) {
      setSlots((prev) => prev.map((s) => (s.id === evt.slot.id ? { ...s, ...evt.slot } : s)))
    }
    if (evt.type === 'FINE_ISSUED' && evt.fine?.student_id === user?.id) {
      pushToast({
        title: 'Fine issued',
        message: `Overstay fine of ${fmtMoney(evt.fine.amount)} added to your account`,
        tone: 'crimson',
      })
      refresh()
      api.me().then((me) => me && patchUser(me)).catch(() => {})
    }
    if (evt.type === 'FINE_SETTLED' && evt.student?.id === user?.id) {
      patchUser(evt.student)
    }
  })

  // ------------- derived -------------
  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (lotFilter !== 'ALL' && String(s.lot_id) !== String(lotFilter)) return false
      if (typeFilter !== 'ALL' && s.slot_type !== typeFilter) return false
      return true
    })
  }, [slots, lotFilter, typeFilter])

  const isBlocked = (user?.unpaid_fine_total || 0) > 0 || user?.is_flagged

  const onSlotClick = (slot) => {
    if (isBlocked) {
      setHardBlock({
        amount: user.unpaid_fine_total || 0,
        flagged: user.is_flagged,
      })
      return
    }
    if (slot.status !== 'AVAILABLE') {
      // Open read-only info modal for occupied slots
      setSelectedSlot({ slot, mode: 'info' })
      return
    }
    setSelectedSlot({ slot, mode: 'reserve' })
  }

  const onReserve = async () => {
    if (!selectedSlot) return
    try {
      const booking = await api.reserve(selectedSlot.slot.id)
      pushToast({
        title: 'Slot reserved',
        message: `${selectedSlot.slot.slot_number} is held for you until the shift ends.`,
        tone: 'olive',
      })
      setSelectedSlot(null)
      setActiveBooking(booking)
      refresh()
    } catch (err) {
      if (err.status === 403 && err.detail) {
        setHardBlock({
          amount: err.detail.unpaid_fine_total || 0,
          flagged: err.detail.is_flagged,
        })
        setSelectedSlot(null)
        return
      }
      pushToast({ title: 'Reservation failed', message: err.message, tone: 'crimson' })
    }
  }

  const onCancel = async () => {
    if (!activeBooking) return
    try {
      await api.cancelBooking(activeBooking.id)
      pushToast({ title: 'Booking cancelled', message: 'Slot returned to inventory.', tone: 'amber' })
      setActiveBooking(null)
      refresh()
    } catch (err) {
      pushToast({ title: 'Cancel failed', message: err.message, tone: 'crimson' })
    }
  }

  const onPark = async () => {
    if (!activeBooking) return
    try {
      const updated = await api.park(activeBooking.id)
      pushToast({ title: 'Vehicle parked', message: 'Your vehicle is now marked as parked.', tone: 'olive' })
      setActiveBooking(updated)
      refresh()
    } catch (err) {
      pushToast({ title: 'Park failed', message: err.message, tone: 'crimson' })
    }
  }

  const onLeave = async () => {
    if (!activeBooking) return
    try {
      await api.leave(activeBooking.id)
      pushToast({ title: 'Bay vacated', message: 'You have left the parking bay.', tone: 'olive' })
      setActiveBooking(null)
      refresh()
    } catch (err) {
      pushToast({ title: 'Leave failed', message: err.message, tone: 'crimson' })
    }
  }

  const onPayAll = async () => {
    try {
      const res = await api.payAllFines()
      patchUser(res.user)
      pushToast({ title: 'All fines paid', message: `Cleared ₹${res.total_paid}. Hard block lifted.`, tone: 'olive' })
      setPayAllOpen(false)
      refresh()
    } catch (err) {
      pushToast({ title: 'Payment failed', message: err.message, tone: 'crimson' })
    }
  }

  // -------------- render --------------
  if (!user) return null

  const shiftKey = (() => {
    const minutes = virtualNow.getHours() * 60 + virtualNow.getMinutes()
    if (minutes >= 9 * 60 && minutes < 12 * 60 + 30) return 'SHIFT_1'
    if (minutes >= 12 * 60 + 30 && minutes < 14 * 60) return 'MIDDAY_CLOSED'
    if (minutes >= 14 * 60 && minutes < 17 * 60 + 30) return 'SHIFT_2'
    return 'OFF_HOURS'
  })()

  const occupancyPct = slots.length
    ? Math.round(
        (slots.filter((s) => ['BOOKED', 'PARKED', 'OVERSTAY'].includes(s.status)).length / slots.length) * 100,
      )
    : 0

  return (
    <div className="space-y-6">
      {/* ============================ TOP METRICS ============================ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={Banknote}
          label="Outstanding Fines"
          value={fmtMoney(user.unpaid_fine_total)}
          sublabel={user.is_flagged ? 'Profile Flagged' : 'No flags on record'}
          tone={user.unpaid_fine_total > 0 ? 'crimson' : 'olive'}
          footer={
            user.unpaid_fine_total > 0 ? (
              <button onClick={() => setPayAllOpen(true)} className="underline uppercase font-bold tracking-widest">
                Pay all dues →
              </button>
            ) : (
              <span className="uppercase tracking-widest">All clear</span>
            )
          }
        />
        <MetricCard
          icon={CarFront}
          label="Active Booking"
          value={activeBooking ? activeBooking.shift.replace('_', ' ') : 'NONE'}
          sublabel={activeBooking ? `Slot #${slots.find((s) => s.id === activeBooking.slot_id)?.slot_number || '—'}` : 'Reserve a slot to begin'}
          tone={activeBooking ? (activeBooking.status === 'overstay' ? 'crimson' : 'olive') : 'default'}
        />
        <MetricCard
          icon={TimerReset}
          label="Current Shift"
          value={shiftKey.replace('_', ' ')}
          sublabel={`${config.shifts[shiftKey]?.start || ''} – ${config.shifts[shiftKey]?.end || ''}`}
          tone={shiftKey === 'MIDDAY_CLOSED' ? 'amber' : shiftKey === 'OFF_HOURS' ? 'slateink' : 'olive'}
          footer={speed !== 1 ? `Virtual clock at ${speed}× speed` : `Live time: ${fmtTime(virtualNow)}`}
        />
        <MetricCard
          icon={ParkingCircle}
          label="Lot Occupancy"
          value={`${occupancyPct}%`}
          sublabel={`${slots.filter((s) => s.status === 'AVAILABLE').length} of ${slots.length} open`}
          tone={occupancyPct > 75 ? 'amber' : 'olive'}
        />
      </section>

      {/* ============================ HARD BLOCK BANNER ============================ */}
      {isBlocked ? (
        <HazardBanner tone="crimson" icon={ShieldAlert}>
          <span>
            <span className="font-bold uppercase tracking-widest">Reservation Blocked — </span>
            You have <span className="font-mono font-bold">{fmtMoney(user.unpaid_fine_total)}</span> in
            unpaid fines{user.is_flagged ? ' and your profile is flagged for review' : ''}. Clear dues
            to unlock booking.
          </span>
        </HazardBanner>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ============================ LEFT — LOT GRID ============================ */}
        <Card
          title="Interactive Slot Map"
          subtitle={`${filteredSlots.length} bay${filteredSlots.length === 1 ? '' : 's'} shown`}
          accent="olive"
          className="xl:col-span-2"
        >
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-ink-600">
              <Filter className="w-3 h-3" /> Filter
            </div>
            <ToggleGroup
              value={lotFilter}
              onChange={setLotFilter}
              options={[
                { value: 'ALL', label: 'All Lots' },
                ...lots.map((l) => ({ value: String(l.id), label: l.name.split(' ')[1] })),
              ]}
            />
            <ToggleGroup
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'ALL', label: 'All Types' },
                { value: 'car', label: 'Car' },
                { value: 'bike', label: 'Bike' },
                { value: 'ev', label: 'EV' },
                { value: 'handicap', label: 'Handicap' },
              ]}
            />
          </div>

          {/* The grid */}
          {loading ? (
            <EmptyState icon={ParkingCircle} title="Loading slot inventory…" hint="Fetching live status from the engine." />
          ) : filteredSlots.length === 0 ? (
            <EmptyState icon={ParkingCircle} title="No slots match these filters" hint="Try a different lot or slot type." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredSlots.map((s) => (
                <SlotTile key={s.id} slot={s} onClick={onSlotClick} />
              ))}
            </div>
          )}

          {/* Legend */}
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

        {/* ============================ RIGHT — ACTIVE PASS ============================ */}
        <ActiveBookingPanel
          booking={activeBooking}
          slot={slots.find((s) => String(s.id) === String(activeBooking?.slot_id))}
          user={user}
          onCancel={onCancel}
          onPark={onPark}
          onLeave={onLeave}
          onPayAll={() => setPayAllOpen(true)}
        />
      </div>

      {/* ============================ MODALS ============================ */}
      <Modal
        open={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        title={selectedSlot?.mode === 'reserve' ? 'Confirm Reservation' : 'Slot Details'}
        accent={selectedSlot?.mode === 'reserve' ? 'olive' : 'slateink'}
      >
        {selectedSlot ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Slot" value={selectedSlot.slot.slot_number} />
              <Info label="Type" value={selectedSlot.slot.slot_type.toUpperCase()} />
              <Info label="Lot" value={lots.find((l) => String(l.id) === String(selectedSlot.slot.lot_id))?.name || '—'} />
              <Info label="Status" value={<StatusBadge status={selectedSlot.slot.status} />} />
            </div>

            {selectedSlot.mode === 'reserve' ? (
              <>
                <HazardBanner tone="amber">
                  By confirming you hold the slot until the end of the current shift. Exceeding the
                  15-minute grace period will trigger an automatic ₹200/hour fine.
                </HazardBanner>

                <div className="bg-canvas border-2 border-ink-900 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-600 uppercase tracking-widest text-[10px]">Vehicle</span>
                    <span className="font-mono font-bold">{user.vehicle_plate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-600 uppercase tracking-widest text-[10px]">Shift</span>
                    <span className="font-mono font-bold">{shiftKey.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-600 uppercase tracking-widest text-[10px]">Current Time</span>
                    <span className="font-mono font-bold">{fmtTime(virtualNow)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setSelectedSlot(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" icon={ParkingCircle} onClick={onReserve}>
                    Confirm Reservation
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-ink-600">
                  This slot is currently {tokenFor(selectedSlot.slot.status).label.toLowerCase()}. Choose
                  a different slot or wait until the vehicle departs.
                </p>
                <div className="flex justify-end pt-2">
                  <Button variant="ghost" onClick={() => setSelectedSlot(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!hardBlock}
        onClose={() => setHardBlock(null)}
        title="Reservation Blocked"
        accent="crimson"
      >
        {hardBlock ? (
          <div className="space-y-4">
            <HazardBanner tone="crimson" icon={AlertOctagon}>
              You have <span className="font-mono font-bold">{fmtMoney(hardBlock.amount)}</span> in unpaid
              fines{hardBlock.flagged ? ' and your profile is flagged for administrative review' : ''}.
              Outstanding dues must be cleared before any reservation.
            </HazardBanner>

            <div className="bg-crimson-50 border-2 border-crimson-600 p-3 text-xs">
              <div className="font-bold uppercase tracking-widest mb-2">How to unlock</div>
              <ol className="list-decimal ml-4 space-y-1 text-ink-600">
                <li>Open the Fines & Compliance tab.</li>
                <li>Settle any outstanding balance using the demo payment simulator.</li>
                <li>Once dues are clear, return to the dashboard and reserve.</li>
              </ol>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setHardBlock(null)}>
                Dismiss
              </Button>
              <Button
                variant="danger"
                icon={FineIcon}
                onClick={() => {
                  setHardBlock(null)
                  setPayAllOpen(true)
                }}
              >
                Settle Fines Now
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={payAllOpen}
        onClose={() => setPayAllOpen(false)}
        title="Settle All Outstanding Fines"
        accent="olive"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            You are about to pay <span className="font-mono font-bold">{fmtMoney(user.unpaid_fine_total)}</span>{' '}
            in outstanding fines. This is a demo simulator — no real payment is processed.
          </p>
          <div className="bg-olive-50 border-2 border-olive-600 p-3 text-xs">
            <div className="font-bold uppercase tracking-widest mb-1">Effect</div>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>All fines marked as paid.</li>
              <li>Hard Block lifted immediately.</li>
              <li>Flag (if any) cleared from profile.</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPayAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={CircleDollarSign} onClick={onPayAll}>
              Pay ₹{user.unpaid_fine_total}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <div className="label-hard">{label}</div>
      <div className="font-mono text-sm font-bold text-ink-900">{value}</div>
    </div>
  )
}

function ActiveBookingPanel({ booking, slot, user, onCancel, onPark, onLeave, onPayAll }) {
  const tick = useClockStore((s) => s.tick)
  const virtualNow = useClockStore.getState().now()
  void tick

  if (!booking) {
    return (
      <Card title="Active Pass" subtitle="None" accent="olive">
        <EmptyState
          icon={ParkingCircle}
          title="No active booking"
          hint="Pick an available slot from the grid to start a reservation."
        />
      </Card>
    )
  }

  const token = tokenFor(booking.status)
  const Icon = token.icon

  // Countdown to expected exit (based on virtual clock)
  const expected = booking.expected_exit_at ? new Date(booking.expected_exit_at) : null
  const remainingMs = expected ? expected.getTime() - virtualNow.getTime() : 0
  const overstayMs = -remainingMs
  const isOverstay = booking.status === 'overstay' || remainingMs < 0

  const fmtCountdown = (ms) => {
    if (ms <= 0) {
      const abs = Math.abs(ms)
      const h = Math.floor(abs / 3_600_000)
      const m = Math.floor((abs % 3_600_000) / 60_000)
      const s = Math.floor((abs % 60_000) / 1000)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    const s = Math.floor((ms % 60_000) / 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const fineEstimate = Math.max(0, Math.ceil(overstayMs / 3_600_000) * config.fine.hourlyRate)

  return (
    <Card
      title="Active Pass"
      subtitle={booking.shift.replace('_', ' ')}
      accent={isOverstay ? 'crimson' : 'olive'}
      className={isOverstay ? 'animate-pulse-hazard' : ''}
    >
      {isOverstay ? (
        <div className="hazard-stripe-crimson h-3 mb-3 animate-hazard-stripes" />
      ) : null}

      <div className="flex items-center gap-3 mb-4">
        <span className={`w-12 h-12 border-2 border-ink-900 flex items-center justify-center ${token.tone === 'crimson' ? 'bg-crimson-600' : token.tone === 'amber' ? 'bg-amber-600' : 'bg-olive-600'} text-canvas-surface`}>
          <Icon className="w-6 h-6" />
        </span>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-600">Slot</div>
          <div className="font-mono text-2xl font-bold">{slot?.slot_number || '—'}</div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Row label="Plate" value={booking.vehicle_plate || user.vehicle_plate} mono />
        <Row label="Status" value={<StatusBadge status={booking.status} />} />
        <Row label="Booked" value={fmtTime(new Date(booking.booked_at))} mono />
        <Row label="Expected Exit" value={expected ? fmtTime(expected) : '—'} mono />
      </dl>

      <div className={`mt-4 border-2 border-ink-900 p-3 ${isOverstay ? 'bg-crimson-50' : 'bg-olive-50'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="label-hard mb-0">
            {isOverstay ? 'Overstay Running' : 'Time Until Grace Ends'}
          </span>
          {isOverstay ? <Badge tone="crimson" icon={AlertOctagon}>OVERSTAY</Badge> : <Badge tone="olive">ON TIME</Badge>}
        </div>
        <div className={`font-mono text-3xl font-bold ${isOverstay ? 'text-crimson-700' : 'text-olive-700'}`}>
          {fmtCountdown(isOverstay ? overstayMs : remainingMs)}
        </div>
        {isOverstay ? (
          <div className="text-[11px] text-ink-600 mt-1">
            Estimated fine accruing: <span className="font-mono font-bold">₹{fineEstimate}</span> per hour
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {booking.status === 'booked' ? (
          <Button variant="primary" size="sm" icon={CarFront} onClick={onPark}>
            Park Vehicle
          </Button>
        ) : null}
        {booking.status === 'parked' || booking.status === 'overstay' ? (
          <Button variant="warning" size="sm" icon={CarFront} onClick={onLeave}>
            Vacate Bay
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel Booking
        </Button>
        {(user.unpaid_fine_total || 0) > 0 ? (
          <Button variant="danger" size="sm" icon={FineIcon} onClick={onPayAll}>
            Pay Fines
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

function Row({ label, value, mono = false }) {
  return (
    <div className="border-2 border-ink-900 p-2 bg-canvas-surface">
      <div className="label-hard">{label}</div>
      <div className={`${mono ? 'font-mono' : ''} text-sm font-bold`}>{value}</div>
    </div>
  )
}
