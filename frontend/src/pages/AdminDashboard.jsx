/**
 * AdminDashboard.jsx
 * --------------------------------------------------------------------------
 * Campus operations control center. Displays:
 *   - High-level KPI cards (occupancy, fines, flags)
 *   - Virtual clock controls (speed multipliers + jump controls)
 *   - Recent system activity feed
 *   - Lot / slot heatmap with quick status overview
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  AlertOctagon,
  Banknote,
  Clock4,
  Flag,
  Gauge,
  ParkingCircle,
  ShieldAlert,
  TimerReset,
  Users,
  Wrench,
} from 'lucide-react'

import api from '@/services/api'
import { useClockStore, shiftLabel } from '@/store/clockStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useAuthStore } from '@/store/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  AuditRow,
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  SlotTile,
  ToggleGroup,
} from '@/components/ui'
import AdminSlotModal from '@/components/AdminSlotModal'
import config from '@/config'

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function AdminDashboard() {
  const tick = useClockStore((s) => s.tick)
  const speed = useClockStore((s) => s.speed)
  const virtualNow = useClockStore.getState().now()
  const pushToast = useNotificationStore((s) => s.push)
  const patchUser = useAuthStore((s) => s.patchUser)

  const [metrics, setMetrics] = useState(null)
  const [audit, setAudit] = useState([])
  const [slots, setSlots] = useState([])
  const [lots, setLots] = useState([])
  const [lotFilter, setLotFilter] = useState('ALL')
  const [selectedSlot, setSelectedSlot] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [m, a, sl, l] = await Promise.all([
        api.metrics(),
        api.auditLog(),
        api.listSlots(),
        api.listLots(),
      ])
      setMetrics(m)
      setAudit(a)
      setSlots(sl)
      setLots(l)
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
      pushToast({ title: 'Fine issued', message: `₹${evt.fine.amount} added to student record.`, tone: 'crimson' })
    }
    if (evt.type === 'AUDIT' && evt.entry) {
      setAudit((prev) => [evt.entry, ...prev].slice(0, 50))
    }
    refresh()
  })

  // local clock actions
  const clockSetSpeed = useClockStore((s) => s.setSpeed)
  const clockJump = useClockStore((s) => s.jump)
  const clockReset = useClockStore((s) => s.reset)

  const onSpeed = async (s) => {
    clockSetSpeed(s)
    try {
      await api.setSpeed(s)
      pushToast({ title: 'Clock speed', message: `Server speed set to ${s}×`, tone: 'olive' })
    } catch (err) {
      pushToast({ title: 'Speed failed', message: err.message, tone: 'crimson' })
    }
  }

  const onJump = async (minutes, label) => {
    clockJump(minutes * 60 * 1000)
    try {
      await api.jumpClock(minutes)
      pushToast({ title: 'Clock jumped', message: `Advanced by ${label}`, tone: 'amber' })
    } catch (err) {
      pushToast({ title: 'Jump failed', message: err.message, tone: 'crimson' })
    }
  }

  const onReset = async () => {
    clockReset()
    try {
      await api.resetClock()
      pushToast({ title: 'Clock reset', message: 'Virtual clock returned to real time', tone: 'default' })
    } catch (err) {
      pushToast({ title: 'Reset failed', message: err.message, tone: 'crimson' })
    }
  }

  const shiftKey = (() => {
    const m = virtualNow.getHours() * 60 + virtualNow.getMinutes()
    if (m >= 9 * 60 && m < 12 * 60 + 30) return 'SHIFT_1'
    if (m >= 12 * 60 + 30 && m < 14 * 60) return 'MIDDAY_CLOSED'
    if (m >= 14 * 60 && m < 17 * 60 + 30) return 'SHIFT_2'
    return 'OFF_HOURS'
  })()

  const filteredSlots = slots.filter((s) => lotFilter === 'ALL' || String(s.lot_id) === String(lotFilter))

  return (
    <div className="space-y-6">
      {/* ============================ METRICS ============================ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={ParkingCircle}
          label="Total Slots"
          value={metrics?.totalSlots ?? '—'}
          sublabel={`${metrics?.lots ?? 0} lots active`}
          tone="olive"
        />
        <MetricCard
          icon={Gauge}
          label="Occupied Bays"
          value={`${metrics?.occupied ?? 0} / ${metrics?.totalSlots ?? 0}`}
          sublabel={`${metrics?.available ?? 0} available`}
          tone={(metrics?.occupied / Math.max(1, metrics?.totalSlots || 1)) > 0.75 ? 'amber' : 'olive'}
        />
        <MetricCard
          icon={AlertOctagon}
          label="Overstay Anomalies"
          value={metrics?.overstays ?? 0}
          sublabel={metrics?.overstays > 0 ? 'Action required' : 'All clear'}
          tone={metrics?.overstays > 0 ? 'crimson' : 'olive'}
        />
        <MetricCard
          icon={Flag}
          label="Flagged Students"
          value={metrics?.flaggedStudents ?? 0}
          sublabel="≥ ₹1,000 unpaid"
          tone={(metrics?.flaggedStudents ?? 0) > 0 ? 'crimson' : 'olive'}
        />
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={Banknote}
          label="Fines Outstanding"
          value={fmtMoney(metrics?.totalOutstanding)}
          sublabel="Across all students"
          tone={(metrics?.totalOutstanding ?? 0) > 0 ? 'crimson' : 'olive'}
        />
        <MetricCard
          icon={Banknote}
          label="Fines Collected"
          value={fmtMoney(metrics?.totalCollected)}
          sublabel="Lifetime"
          tone="olive"
        />
        <MetricCard
          icon={Clock4}
          label="Virtual Clock"
          value={`${speed}×`}
          sublabel={shiftLabel(shiftKey)}
          tone={speed === 1 ? 'olive' : 'amber'}
        />
        <MetricCard
          icon={Users}
          label="Active Sessions"
          value="1"
          sublabel="You (admin)"
          tone="slateink"
        />
      </div>

      {/* ============================ VIRTUAL CLOCK CONTROLS ============================ */}
      <Card title="Virtual Time Controller" subtitle="Fast-forward shift transitions" accent="amber">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="label-hard">Speed Multiplier</div>
            <div className="flex items-stretch border-2 border-ink-900 shadow-hard-sm">
              {[1, 5, 60].map((sp) => (
                <button
                  key={sp}
                  onClick={() => onSpeed(sp)}
                  className={[
                    'flex-1 px-3 py-2 text-xs font-bold uppercase tracking-widest border-l-2 border-ink-900 first:border-l-0',
                    speed === sp ? 'bg-ink-900 text-canvas-surface' : 'bg-canvas-surface text-ink-900 hover:bg-canvas',
                  ].join(' ')}
                >
                  {sp}×
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              Use 60× to instantly traverse a full shift. 5× simulates a slower demo.
            </p>
          </div>

          <div>
            <div className="label-hard">Quick Jump</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="warning" size="sm" onClick={() => onJump(15, '15 minutes')}>+15m</Button>
              <Button variant="warning" size="sm" onClick={() => onJump(30, '30 minutes')}>+30m</Button>
              <Button variant="warning" size="sm" onClick={() => onJump(120, '2 hours')}>+2h</Button>
              <Button variant="warning" size="sm" onClick={() => onJump(360, '6 hours')}>+6h</Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              Jump forward to step over a shift end and trigger the overstay engine.
            </p>
          </div>

          <div>
            <div className="label-hard">Jump to Shift End</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" size="sm" onClick={() => jumpToShiftEnd('SHIFT_1')}>
                → 12:45
              </Button>
              <Button variant="danger" size="sm" onClick={() => jumpToShiftEnd('SHIFT_2')}>
                → 17:45
              </Button>
              <Button variant="ghost" size="sm" icon={TimerReset} onClick={onReset}>
                Reset Clock
              </Button>
              <Button variant="ghost" size="sm" icon={Wrench} onClick={() => useNotificationStore.getState().push({ title: 'Tip', message: 'Use the Lots page to toggle maintenance.', tone: 'default' })}>
                Maintenance
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              These land exactly at the grace-end moment for instant demo of overstay fines.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t-2 border-ink-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <KV label="Virtual Time" value={virtualNow.toLocaleTimeString()} mono />
          <KV label="Shift" value={shiftKey.replace('_', ' ')} />
          <KV label="Speed" value={`${speed}×`} mono />
          <KV label="Hourly Fine" value={fmtMoney(config.fine.hourlyRate)} mono />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ============================ LOT MAP ============================ */}
        <Card
          title="Campus Heatmap"
          subtitle="60 slots · 3 lots"
          accent="olive"
          className="xl:col-span-2"
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <ToggleGroup
              value={lotFilter}
              onChange={setLotFilter}
              options={[
                { value: 'ALL', label: 'All' },
                ...lots.map((l) => ({ value: String(l.id), label: l.name.split(' ')[1] })),
              ]}
            />
            <div className="text-[10px] uppercase tracking-widest text-ink-500 font-mono hidden sm:block">
              Click any bay to manually manage status
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="olive">Available {slots.filter((s) => s.status === 'AVAILABLE').length}</Badge>
              <Badge tone="amber">Booked {slots.filter((s) => s.status === 'BOOKED').length}</Badge>
              <Badge tone="slateink">Parked {slots.filter((s) => s.status === 'PARKED').length}</Badge>
              <Badge tone="crimson">Overstay {slots.filter((s) => s.status === 'OVERSTAY').length}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2">
            {filteredSlots.map((s) => (
              <SlotTile
                key={s.id}
                slot={s}
                compact
                onClick={() => setSelectedSlot(s)}
                active={selectedSlot?.id === s.id}
              />
            ))}
          </div>
        </Card>

        {/* ============================ AUDIT FEED ============================ */}
        <Card title="System Audit Log" subtitle="Live stream" accent="slateink">
          {audit.length === 0 ? (
            <EmptyState icon={Activity} title="Quiet system" hint="Audit events appear here as they happen." />
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {audit.slice(0, 40).map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Flagged alert */}
      {(metrics?.flaggedStudents ?? 0) > 0 ? (
        <Card title="Authority Flagged Accounts" accent="crimson" icon={ShieldAlert}>
          <p className="text-sm text-ink-600">
            {metrics.flaggedStudents} student profile(s) have crossed the ₹1,000 unpaid threshold.
            Review the Audit page for context and the Students tab in Fines for ledger details.
          </p>
        </Card>
      ) : null}

      {/* Admin manual slot status control modal */}
      {selectedSlot && (
        <AdminSlotModal
          open={!!selectedSlot}
          slot={slots.find((s) => s.id === selectedSlot.id) || selectedSlot}
          lotName={lots.find((l) => String(l.id) === String(selectedSlot.lot_id))?.name}
          onClose={() => setSelectedSlot(null)}
          onUpdated={(updated) => {
            setSlots((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
          }}
        />
      )}
    </div>
  )

  function jumpToShiftEnd(shift) {
    const target = new Date(virtualNow)
    if (shift === 'SHIFT_1') target.setHours(12, 45, 0, 0)
    else target.setHours(17, 45, 0, 0)
    const delta = target.getTime() - virtualNow.getTime()
    if (delta > 0) {
      clockJump(delta)
      api.jumpClock(Math.round(delta / 60_000))
      pushToast({ title: 'Clock jumped', message: `Set to ${target.toLocaleTimeString()} (${shift.replace('_', ' ')} grace end)`, tone: 'amber' })
    } else {
      pushToast({ title: 'Already past', message: 'Virtual clock is past the grace end for that shift.', tone: 'amber' })
    }
  }
}

function KV({ label, value, mono = false }) {
  return (
    <div className="border-2 border-ink-900 bg-canvas-surface p-2">
      <div className="label-hard">{label}</div>
      <div className={`${mono ? 'font-mono' : ''} text-sm font-bold`}>{value}</div>
    </div>
  )
}
