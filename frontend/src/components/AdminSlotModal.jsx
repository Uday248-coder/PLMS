/**
 * AdminSlotModal.jsx
 * --------------------------------------------------------------------------
 * High-authority slot management drawer/modal for Campus Admins.
 * Allows manually overriding slot states:
 *   - Available (Restores slot, clears active bookings, sets override to available)
 *   - Maintenance (Takes slot offline for repairs / servicing)
 *   - Closed / Blocked (Locks slot administratively for VIP / events)
 *   - Force Release / Evict (Frees bay if occupied or held by a student)
 */

import React, { useState } from 'react'
import {
  AlertOctagon,
  Ban,
  CheckCircle2,
  Clock4,
  LogOut,
  Power,
  ShieldAlert,
  Wrench,
  CarFront,
} from 'lucide-react'

import {
  Badge,
  Button,
  HazardBanner,
  Modal,
  SlotTypeIcon,
  tokenFor,
} from '@/components/ui'
import api from '@/services/api'
import { useNotificationStore } from '@/store/notificationStore'

export default function AdminSlotModal({ slot, lotName, open, onClose, onUpdated }) {
  const pushToast = useNotificationStore((s) => s.push)
  const [loadingAction, setLoadingAction] = useState(null)
  const [error, setError] = useState(null)

  if (!slot) return null

  const token = tokenFor(slot.status)
  const isOccupiedOrHeld = ['BOOKED', 'PARKED', 'OVERSTAY'].includes(slot.status)

  const handleSetStatus = async (targetStatus, label) => {
    setLoadingAction(targetStatus)
    setError(null)
    try {
      const updated = await api.setSlotStatus(slot.id, targetStatus)
      pushToast({
        title: 'Slot Status Updated',
        message: `Bay ${slot.slot_number} marked as ${label || targetStatus}.`,
        tone: targetStatus === 'AVAILABLE' ? 'olive' : targetStatus === 'MAINTENANCE' ? 'amber' : 'crimson',
      })
      onUpdated?.(updated || { ...slot, status: targetStatus })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update slot status')
      pushToast({
        title: 'Update Failed',
        message: err.message || 'Server error updating slot',
        tone: 'crimson',
      })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Slot Control: ${slot.slot_number}`}
      description="Administrative manual override & bay state management"
      accent={token.tone || 'slateink'}
      size="md"
    >
      <div className="space-y-4 text-xs">
        {error && (
          <HazardBanner tone="crimson">
            {error}
          </HazardBanner>
        )}

        {/* Overview Box */}
        <div className="bg-canvas border-2 border-ink-900 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-widest text-ink-600">
              Current State
            </span>
            <span
              className={`stamp text-xs ${
                token.tone === 'olive'
                  ? 'bg-olive-600 text-white'
                  : token.tone === 'amber'
                  ? 'bg-amber-600 text-white'
                  : token.tone === 'crimson'
                  ? 'bg-crimson-600 text-white animate-pulse'
                  : 'bg-slateink-600 text-white'
              }`}
            >
              {token.stamp} · {token.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-ink-200">
            <div>
              <span className="text-[10px] uppercase text-ink-600 block">Lot Location</span>
              <span className="font-mono font-bold text-ink-900 text-sm">{lotName || `Lot ${slot.lot_id}`}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-ink-600 block">Vehicle Category</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <SlotTypeIcon type={slot.slot_type} className="w-4 h-4 text-ink-700" />
                <span className="font-mono font-bold text-ink-900 uppercase">{slot.slot_type}</span>
              </div>
            </div>
          </div>

          {slot.vehicle_plate && (
            <div className="pt-2 border-t border-ink-200 flex items-center justify-between">
              <span className="text-[10px] uppercase text-ink-600">Active Vehicle</span>
              <span className="font-mono font-bold text-sm bg-ink-900 text-canvas-surface px-2 py-0.5">
                {slot.vehicle_plate}
              </span>
            </div>
          )}
        </div>

        {/* Warning if occupied */}
        {isOccupiedOrHeld && (
          <div className="p-2.5 bg-amber-50 border-2 border-amber-500 text-amber-900 rounded-none flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-tight">
              <strong>Active Booking Present:</strong> Setting this slot to Available or Maintenance will automatically cancel or conclude the active booking.
            </div>
          </div>
        )}

        {/* Manual Actions Grid */}
        <div className="space-y-2 pt-1">
          <div className="text-[10px] uppercase font-bold tracking-widest text-ink-600">
            Override Slot Status
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Make Available */}
            <Button
              variant={slot.status === 'AVAILABLE' ? 'default' : 'primary'}
              icon={CheckCircle2}
              loading={loadingAction === 'AVAILABLE'}
              disabled={loadingAction !== null || slot.status === 'AVAILABLE'}
              onClick={() => handleSetStatus('AVAILABLE', 'Available (Open)')}
              className="w-full justify-start text-left"
            >
              <div className="truncate">
                <div className="font-bold">Set Available</div>
                <div className="text-[10px] font-normal opacity-80">Free bay for reservations</div>
              </div>
            </Button>

            {/* Set Maintenance */}
            <Button
              variant={slot.status === 'MAINTENANCE' ? 'default' : 'warning'}
              icon={Wrench}
              loading={loadingAction === 'MAINTENANCE'}
              disabled={loadingAction !== null || slot.status === 'MAINTENANCE'}
              onClick={() => handleSetStatus('MAINTENANCE', 'Maintenance (Offline)')}
              className="w-full justify-start text-left"
            >
              <div className="truncate">
                <div className="font-bold">Set Maintenance</div>
                <div className="text-[10px] font-normal opacity-80">Take offline for repairs</div>
              </div>
            </Button>

            {/* Close / Block */}
            <Button
              variant={slot.status === 'CLOSED' ? 'default' : 'danger'}
              icon={Ban}
              loading={loadingAction === 'CLOSED'}
              disabled={loadingAction !== null || slot.status === 'CLOSED'}
              onClick={() => handleSetStatus('CLOSED', 'Closed (Blocked)')}
              className="w-full justify-start text-left"
            >
              <div className="truncate">
                <div className="font-bold">Block Bay (Close)</div>
                <div className="text-[10px] font-normal opacity-80">Prevent all bookings</div>
              </div>
            </Button>

            {/* Force Release / Clear */}
            {isOccupiedOrHeld ? (
              <Button
                variant="danger"
                icon={LogOut}
                loading={loadingAction === 'FORCE_CLEAR'}
                disabled={loadingAction !== null}
                onClick={() => handleSetStatus('AVAILABLE', 'Force Released')}
                className="w-full justify-start text-left border-dashed"
              >
                <div className="truncate">
                  <div className="font-bold text-crimson-600">Force Evict / Free</div>
                  <div className="text-[10px] font-normal opacity-80">Clear holding vehicle</div>
                </div>
              </Button>
            ) : (
              /* Simulate Occupied */
              <Button
                variant="default"
                icon={CarFront}
                loading={loadingAction === 'PARKED'}
                disabled={loadingAction !== null || slot.status === 'PARKED'}
                onClick={() => handleSetStatus('PARKED', 'Occupied')}
                className="w-full justify-start text-left"
              >
                <div className="truncate">
                  <div className="font-bold">Mark Occupied</div>
                  <div className="text-[10px] font-normal opacity-80">Manual vehicle hold</div>
                </div>
              </Button>
            )}
          </div>
        </div>

        {/* Footer controls */}
        <div className="flex justify-end pt-3 border-t-2 border-ink-100">
          <Button variant="ghost" onClick={onClose} disabled={loadingAction !== null}>
            Dismiss
          </Button>
        </div>
      </div>
    </Modal>
  )
}
