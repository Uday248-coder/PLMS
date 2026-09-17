/**
 * GuardOverstaysPage.jsx
 * --------------------------------------------------------------------------
 * Dedicated overstays queue — same data as the dashboard's queue card but
 * with finer-grained controls (refresh, manual report, status filter).
 */

import React, { useEffect, useState, useCallback } from 'react'
import { AlertOctagon, RefreshCcw, Flag, CarFront, CheckCircle2 } from 'lucide-react'
import api from '@/services/api'
import { useNotificationStore } from '@/store/notificationStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  Button,
  Card,
  EmptyState,
  MetricCard,
  ToggleGroup,
} from '@/components/ui'
import { useAuthStore } from '@/store/authStore'

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function GuardOverstaysPage() {
  const pushToast = useNotificationStore((s) => s.push)
  const user = useAuthStore((s) => s.user)

  const [slots, setSlots] = useState([])
  const [statusFilter, setStatusFilter] = useState('OVERSTAY')
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const sl = await api.listSlots()
      setSlots(sl)
    } catch (err) {
      if (err.status !== 401) {
        pushToast({ title: 'Refresh failed', message: err.message, tone: 'crimson' })
      }
    }
  }, [pushToast])

  useEffect(() => {
    refresh()
  }, [refresh, tick])

  useWebSocket((evt) => {
    if (evt.type === 'SLOT_UPDATED' && evt.slot) {
      setSlots((prev) => prev.map((s) => (s.id === evt.slot.id ? { ...s, ...evt.slot } : s)))
    }
    if (evt.type === 'FINE_ISSUED') {
      pushToast({ title: 'Auto-fine issued', message: `${fmtMoney(evt.fine.amount)} added to a student record.`, tone: 'crimson' })
    }
  })

  const visible = slots.filter((s) => {
    if (statusFilter === 'ALL') return true
    return s.status === statusFilter
  })

  const overstays = slots.filter((s) => s.status === 'OVERSTAY').length
  const parked = slots.filter((s) => s.status === 'PARKED').length

  const onReport = async (slot) => {
    if (!slot.vehicle_plate) return
    try {
      const res = await api.lookupPlate(slot.vehicle_plate)
      if (res?.booking) {
        await api.reportOverstay(res.booking.id)
        pushToast({ title: 'Overstay Reported', message: `Fine issued for ${slot.slot_number}.`, tone: 'crimson' })
      }
    } catch (err) {
      pushToast({ title: 'Report failed', message: err.message, tone: 'crimson' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={AlertOctagon} label="Overstay Count" value={overstays} tone={overstays > 0 ? 'crimson' : 'olive'} />
        <MetricCard icon={CarFront} label="Currently Parked" value={parked} tone="olive" />
        <MetricCard icon={CheckCircle2} label="Open Slots" value={slots.filter((s) => s.status === 'AVAILABLE').length} tone="olive" />
        <MetricCard icon={Flag} label="Guard" value={user?.name?.split(' ')[0] || 'You'} tone="slateink" />
      </div>

      <Card
        title="Overstay & Violations Queue"
        subtitle={`${visible.length} record${visible.length === 1 ? '' : 's'}`}
        accent="crimson"
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <ToggleGroup
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'OVERSTAY', label: 'Overstay' },
              { value: 'PARKED', label: 'Parked' },
              { value: 'BOOKED', label: 'Booked' },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <Button variant="ghost" size="sm" icon={RefreshCcw} onClick={() => setTick(tick + 1)}>
            Refresh
          </Button>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No records" hint="There are no slots in this state right now." />
        ) : (
          <div className="space-y-2">
            {visible.map((s) => (
              <div
                key={s.id}
                className={`border-2 border-ink-900 p-3 flex items-center gap-3 ${s.status === 'OVERSTAY' ? 'bg-crimson-50 animate-pulse-hazard' : 'bg-canvas-surface'}`}
              >
                <span className={`w-10 h-10 border-2 border-ink-900 flex items-center justify-center ${s.status === 'OVERSTAY' ? 'bg-crimson-600' : 'bg-ink-900'} text-canvas-surface font-mono font-bold`}>
                  {s.slot_number}
                </span>
                <div className="flex-1">
                  <div className="font-mono text-sm font-bold">{s.vehicle_plate || '— vacant —'}</div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-600">
                    {s.status} · {s.slot_type.toUpperCase()}
                  </div>
                </div>
                {s.status === 'OVERSTAY' ? (
                  <Button variant="danger" size="sm" icon={Flag} onClick={() => onReport(s)}>
                    Report & Fine
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
