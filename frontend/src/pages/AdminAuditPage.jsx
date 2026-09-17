/**
 * AdminAuditPage.jsx
 * --------------------------------------------------------------------------
 * Standalone audit log viewer. Streams every event the system records into
 * a filterable table.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Activity, Filter, RefreshCcw, Search } from 'lucide-react'
import api from '@/services/api'
import { useNotificationStore } from '@/store/notificationStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { AuditRow, Button, Card, EmptyState, Field, Input, ToggleGroup } from '@/components/ui'

export default function AdminAuditPage() {
  const pushToast = useNotificationStore((s) => s.push)
  const [entries, setEntries] = useState([])
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const list = await api.auditLog()
      setEntries(list)
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
    if (evt.type === 'AUDIT' && evt.entry) {
      setEntries((prev) => [evt.entry, ...prev])
    }
  })

  const filtered = entries.filter((e) => {
    if (roleFilter !== 'ALL' && e.actor_role !== roleFilter.toLowerCase()) return false
    if (query && !`${e.action} ${e.details}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <Card title="System Audit Log" subtitle={`${filtered.length} of ${entries.length} entries`} accent="slateink">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-ink-600">
            <Filter className="w-3 h-3" /> Filter
          </div>
          <ToggleGroup
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'student', label: 'Student' },
              { value: 'guard', label: 'Guard' },
              { value: 'admin', label: 'Admin' },
              { value: 'system', label: 'System' },
            ]}
          />
          <div className="flex-1 min-w-[200px]">
            <Field>
              <Input
                placeholder="Search actions…"
                icon={Search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCcw} onClick={() => setTick(tick + 1)}>
            Refresh
          </Button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Activity} title="No matching entries" hint="Adjust filters or wait for new activity." />
        ) : (
          <div className="space-y-1 max-h-[70vh] overflow-y-auto">
            {filtered.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
