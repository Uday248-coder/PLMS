/**
 * AdminMaintenancePage.jsx
 * --------------------------------------------------------------------------
 * Lot / slot maintenance console. Toggle individual slots into/out of
 * MAINTENANCE state and bulk-toggle an entire lot.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Wrench, AlertOctagon, Power } from 'lucide-react'
import api from '@/services/api'
import { useNotificationStore } from '@/store/notificationStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  SlotTile,
  ToggleGroup,
} from '@/components/ui'
import AdminSlotModal from '@/components/AdminSlotModal'

export default function AdminMaintenancePage() {
  const pushToast = useNotificationStore((s) => s.push)
  const [lots, setLots] = useState([])
  const [slots, setSlots] = useState([])
  const [lotFilter, setLotFilter] = useState('ALL')
  const [selectedSlot, setSelectedSlot] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [l, sl] = await Promise.all([api.listLots(), api.listSlots()])
      setLots(l)
      setSlots(sl)
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
  })

  const toggleMaintenance = async (slot) => {
    const on = slot.status !== 'MAINTENANCE'
    try {
      await api.setMaintenance(slot.id, on)
      pushToast({
        title: on ? 'Slot taken offline' : 'Slot restored',
        message: `${slot.slot_number} → ${on ? 'MAINTENANCE' : 'AVAILABLE'}`,
        tone: on ? 'amber' : 'olive',
      })
    } catch (err) {
      pushToast({ title: 'Update failed', message: err.message, tone: 'crimson' })
    }
  }

  const bulkToggle = async (lotId, on) => {
    const targets = slots.filter((s) => String(s.lot_id) === String(lotId))
    for (const s of targets) {
      if ((on && s.status !== 'MAINTENANCE') || (!on && s.status === 'MAINTENANCE')) {
        // eslint-disable-next-line no-await-in-loop
        await api.setMaintenance(s.id, on).catch(() => null)
      }
    }
    pushToast({
      title: on ? 'Lot taken offline' : 'Lot restored',
      message: `${targets.length} slot${targets.length === 1 ? '' : 's'} updated`,
      tone: on ? 'amber' : 'olive',
    })
  }

  const filtered = slots.filter((s) => lotFilter === 'ALL' || String(s.lot_id) === String(lotFilter))
  const maintenance = slots.filter((s) => s.status === 'MAINTENANCE').length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={Wrench} label="In Maintenance" value={maintenance} tone={maintenance > 0 ? 'amber' : 'olive'} />
        <MetricCard icon={AlertOctagon} label="Available" value={slots.filter((s) => s.status === 'AVAILABLE').length} tone="olive" />
        <MetricCard icon={Wrench} label="Lots" value={lots.length} tone="slateink" />
        <MetricCard icon={Wrench} label="Slots" value={slots.length} tone="slateink" />
      </div>

      <Card title="Bulk Lot Controls" subtitle="Toggle entire lots offline" accent="amber">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {lots.map((l) => (
            <div key={l.id} className="card-flat p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-bold text-sm">{l.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-600">{l.location}</div>
                </div>
                <Badge tone={l.is_active ? 'olive' : 'amber'}>{l.is_active ? 'Active' : 'Paused'}</Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="warning"
                  size="sm"
                  icon={Power}
                  onClick={() => bulkToggle(l.id, true)}
                  className="flex-1 justify-center"
                >
                  Take Offline
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Power}
                  onClick={() => bulkToggle(l.id, false)}
                  className="flex-1 justify-center"
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Slot Maintenance" subtitle="Toggle individual slots" accent="slateink">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <ToggleGroup
            value={lotFilter}
            onChange={setLotFilter}
            options={[
              { value: 'ALL', label: 'All' },
              ...lots.map((l) => ({ value: String(l.id), label: l.name.split(' ')[1] })),
            ]}
          />
          <div className="ml-auto text-[10px] uppercase tracking-widest text-ink-600">
            {filtered.length} slot{filtered.length === 1 ? '' : 's'} shown
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Wrench} title="No slots" hint="Adjust the lot filter to see slots." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((s) => (
              <div key={s.id} className="space-y-2">
                <SlotTile
                  slot={s}
                  compact
                  onClick={() => setSelectedSlot(s)}
                  active={selectedSlot?.id === s.id}
                />
                <div className="flex gap-1.5">
                  <Button
                    variant={s.status === 'MAINTENANCE' ? 'primary' : 'warning'}
                    size="sm"
                    icon={Power}
                    onClick={() => toggleMaintenance(s)}
                    className="flex-1 justify-center text-[11px]"
                  >
                    {s.status === 'MAINTENANCE' ? 'Restore' : 'Offline'}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setSelectedSlot(s)}
                    className="px-2.5 justify-center text-[11px]"
                    title="Open slot management control"
                  >
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

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
}
