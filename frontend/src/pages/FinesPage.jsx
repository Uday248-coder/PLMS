/**
 * FinesPage.jsx
 * --------------------------------------------------------------------------
 * Itemized fine ledger for the student. Shows every outstanding and paid
 * fine, computes the live ₹20/day late penalty for fines older than 7
 * days, and offers per-fine and "pay all" demo settlement.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  Banknote,
  CircleDollarSign,
  AlertOctagon,
  CheckCircle2,
  Receipt,
  Clock4,
} from 'lucide-react'

import api from '@/services/api'
import config from '@/config'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HazardBanner,
  MetricCard,
  Modal,
} from '@/components/ui'
import { FINE_REASONS } from '@/components/ui/statusTokens'

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const fmtDate = (iso) => new Date(iso).toLocaleString()

export default function FinesPage() {
  const user = useAuthStore((s) => s.user)
  const patchUser = useAuthStore((s) => s.patchUser)
  const pushToast = useNotificationStore((s) => s.push)
  const [fines, setFines] = useState([])
  const [confirmAll, setConfirmAll] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = await api.myFines()
      setFines(list)
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
    if (evt.type === 'FINE_ISSUED' && evt.fine) {
      setFines((prev) => {
        const existing = prev.find((f) => f.id === evt.fine.id)
        if (existing) return prev.map((f) => (f.id === evt.fine.id ? { ...f, ...evt.fine } : f))
        return [evt.fine, ...prev]
      })
      pushToast({ title: 'Fine added', message: `${fmtMoney(evt.fine.amount)} · ${FINE_REASONS[evt.fine.reason]}`, tone: 'crimson' })
    }
    if (evt.type === 'FINE_SETTLED' && evt.student?.id === user?.id) {
      patchUser(evt.student)
      refresh()
    }
  })

  const onPayOne = async (id) => {
    try {
      const res = await api.payFine(id)
      pushToast({ title: 'Fine paid', message: `${fmtMoney(res.amount)} settled.`, tone: 'olive' })
      refresh()
      api.me().then((me) => me && patchUser(me))
    } catch (err) {
      pushToast({ title: 'Payment failed', message: err.message, tone: 'crimson' })
    }
  }

  const onPayAll = async () => {
    try {
      const res = await api.payAllFines()
      patchUser(res.user)
      pushToast({ title: 'All fines paid', message: `Cleared ₹${res.total_paid}. Hard block lifted.`, tone: 'olive' })
      setConfirmAll(false)
      refresh()
    } catch (err) {
      pushToast({ title: 'Payment failed', message: err.message, tone: 'crimson' })
    }
  }

  if (!user) return null

  const outstanding = fines.filter((f) => f.status === 'unpaid')
  const paid = fines.filter((f) => f.status === 'paid')
  const totalOutstanding = outstanding.reduce((a, b) => a + b.amount, 0)
  const totalPaid = paid.reduce((a, b) => a + b.amount, 0)
  const overdueCount = outstanding.filter((f) => f.days_overdue > 0).length

  return (
    <div className="space-y-6">
      {/* ============================ METRICS ============================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={Banknote}
          label="Outstanding"
          value={fmtMoney(totalOutstanding)}
          sublabel={`${outstanding.length} unpaid fine${outstanding.length === 1 ? '' : 's'}`}
          tone={totalOutstanding > 0 ? 'crimson' : 'olive'}
        />
        <MetricCard
          icon={AlertOctagon}
          label="Late Penalties"
          value={fmtMoney(outstanding.reduce((a, b) => a + (b.days_overdue * config.fine.latePenaltyPerDay), 0))}
          sublabel={`${overdueCount} fine${overdueCount === 1 ? '' : 's'} past 7 days`}
          tone={overdueCount > 0 ? 'crimson' : 'olive'}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Settled"
          value={fmtMoney(totalPaid)}
          sublabel={`${paid.length} paid fine${paid.length === 1 ? '' : 's'}`}
          tone="olive"
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Hard Block"
          value={(user.unpaid_fine_total || 0) > 0 || user.is_flagged ? 'YES' : 'NO'}
          sublabel={user.is_flagged ? 'Profile Flagged' : 'No flags on record'}
          tone={(user.unpaid_fine_total || 0) > 0 || user.is_flagged ? 'crimson' : 'olive'}
        />
      </div>

      {/* ============================ HARD BLOCK BANNER ============================ */}
      {(user.unpaid_fine_total || 0) > 0 || user.is_flagged ? (
        <HazardBanner tone="crimson" icon={AlertOctagon}>
          <span>
            <span className="font-bold uppercase tracking-widest">Hard Block Active — </span>
            Your account is blocked from booking until all fines are settled
            {user.is_flagged ? ' and your flag is cleared by an administrator' : ''}.
          </span>
        </HazardBanner>
      ) : null}

      {/* ============================ ACTION ROW ============================ */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={CircleDollarSign}
          onClick={() => setConfirmAll(true)}
          disabled={totalOutstanding === 0}
        >
          Pay All Outstanding — {fmtMoney(totalOutstanding)}
        </Button>
        <div className="text-[11px] uppercase tracking-widest text-ink-600">
          Demo simulator · no real money is moved
        </div>
      </div>

      {/* ============================ LEDGER ============================ */}
      <Card title="Fine Ledger" subtitle="Itemized breakdown" accent={totalOutstanding > 0 ? 'crimson' : 'olive'}>
        {fines.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No fines on record"
            hint="Park responsibly — overstay penalties never apply to good citizens."
          />
        ) : (
          <div className="space-y-2">
            {fines.map((f) => (
              <FineRow key={f.id} fine={f} onPay={onPayOne} />
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Settle All Outstanding Fines"
        accent="olive"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            You are about to settle <span className="font-mono font-bold">{fmtMoney(totalOutstanding)}</span>{' '}
            in outstanding fines across {outstanding.length} record{outstanding.length === 1 ? '' : 's'}.
            This is a demo payment — no card or bank is charged.
          </p>
          <div className="bg-olive-50 border-2 border-olive-600 p-3 text-xs space-y-1">
            <div className="font-bold uppercase tracking-widest">After Settlement</div>
            <ul className="list-disc ml-4 space-y-0.5 text-ink-600">
              <li>Hard Block lifted immediately.</li>
              <li>Profile flag cleared (if balance was ≥ ₹1,000).</li>
              <li>Booking access restored.</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={CircleDollarSign} onClick={onPayAll}>
              Confirm Payment — {fmtMoney(totalOutstanding)}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FineRow({ fine, onPay }) {
  const ageMs = Date.now() - new Date(fine.issued_at).getTime()
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  const overdueDays = Math.max(0, ageDays - 7)
  const latePenalty = overdueDays * config.fine.latePenaltyPerDay
  const isOverdue = overdueDays > 0 && fine.status === 'unpaid'
  const isPaid = fine.status === 'paid'

  return (
    <div
      className={`card-flat p-3 flex flex-col lg:flex-row lg:items-center gap-3 ${
        isPaid ? 'bg-olive-50' : isOverdue ? 'bg-crimson-50' : 'bg-canvas-surface'
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <span
          className={`w-10 h-10 border-2 border-ink-900 flex items-center justify-center ${
            isPaid ? 'bg-olive-600' : isOverdue ? 'bg-crimson-600' : 'bg-amber-600'
          } text-canvas-surface`}
        >
          <Receipt className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">#{fine.id}</span>
            <Badge tone={fine.reason === 'OVERSTAY' ? 'amber' : fine.reason === 'LATE_FEE' ? 'crimson' : 'slateink'}>
              {FINE_REASONS[fine.reason] || fine.reason}
            </Badge>
            <Badge tone={isPaid ? 'olive' : 'crimson'}>{isPaid ? 'Paid' : 'Outstanding'}</Badge>
          </div>
          <div className="text-xs text-ink-600 mt-1">{fine.description}</div>
          <div className="text-[11px] text-ink-600 mt-1 flex flex-wrap gap-3">
            <span>
              Issued: <span className="font-mono">{fmtDate(fine.issued_at)}</span>
            </span>
            {fine.paid_at ? (
              <span>
                Settled: <span className="font-mono">{fmtDate(fine.paid_at)}</span>
              </span>
            ) : null}
            {isOverdue ? (
              <span className="text-crimson-700 font-bold flex items-center gap-1">
                <Clock4 className="w-3 h-3" />
                {overdueDays} day{overdueDays === 1 ? '' : 's'} overdue (+{fmtMoney(latePenalty)} penalty)
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-mono text-2xl font-bold">{fmtMoney(fine.amount)}</div>
          {isOverdue && fine.base_amount && fine.base_amount !== fine.amount ? (
            <div className="text-[10px] uppercase tracking-widest text-ink-600">
              Base {fmtMoney(fine.base_amount)} + penalty {fmtMoney(latePenalty)}
            </div>
          ) : null}
        </div>
        {!isPaid ? (
          <Button variant="primary" size="sm" icon={CircleDollarSign} onClick={() => onPay(fine.id)}>
            Pay Now
          </Button>
        ) : null}
      </div>
    </div>
  )
}
