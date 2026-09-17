/**
 * AppShell.jsx
 * --------------------------------------------------------------------------
 * Top-level chrome: header, virtual clock bar, role-aware navigation, and
 * the floating toast viewport. Renders the routed page content below.
 *
 * The clock and connection pill subscribe to their respective stores so
 * they update in real time without forcing the entire shell to re-render.
 */

import React, { useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Clock4,
  LogOut,
  UserCircle2,
  Gauge,
  ShieldCheck,
  Wrench,
  Banknote,
  ParkingCircle,
  Activity,
  ListChecks,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useClockStore, shiftLabel, startClockLoop } from '@/store/clockStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useNotificationStore } from '@/store/notificationStore'
import {
  Button,
  ClockDisplay,
  ConnectionPill,
  ToastViewport,
  Badge,
} from '@/components/ui'
import config from '@/config'

const NAV_ITEMS = {
  student: [
    { to: '/student', label: 'Dashboard', icon: ParkingCircle },
    { to: '/student/fines', label: 'Fines', icon: Banknote },
  ],
  guard: [
    { to: '/guard', label: 'Gate', icon: ShieldCheck },
    { to: '/guard/overstays', label: 'Overstays', icon: Activity },
  ],
  admin: [
    { to: '/admin', label: 'Campus', icon: Gauge },
    { to: '/admin/audit', label: 'Audit', icon: ListChecks },
    { to: '/admin/maintenance', label: 'Lots', icon: Wrench },
  ],
}

export function AppShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const tick = useClockStore((s) => s.tick)
  const speed = useClockStore((s) => s.speed)
  const connStatus = useConnectionStore((s) => s.status)
  const toasts = useNotificationStore((s) => s.toasts)
  const dismissToast = useNotificationStore((s) => s.dismiss)

  // Boot the global clock loop once on mount
  useEffect(() => {
    startClockLoop()
  }, [])

  const now = useClockStore.getState().now()
  const shift = (() => {
    const minutes = now.getHours() * 60 + now.getMinutes()
    if (minutes >= 9 * 60 && minutes < 12 * 60 + 30) return 'SHIFT_1'
    if (minutes >= 12 * 60 + 30 && minutes < 14 * 60) return 'MIDDAY_CLOSED'
    if (minutes >= 14 * 60 && minutes < 17 * 60 + 30) return 'SHIFT_2'
    return 'OFF_HOURS'
  })()

  const items = NAV_ITEMS[user?.role] || []

  const onLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // re-evaluate now each tick so the displayed clock advances.
  void tick

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#plms-main" className="skip-link">
        Skip to content
      </a>
      {/* ============================ TOP BAR ============================ */}
      <header className="sticky top-0 z-30 bg-canvas-surface border-b-2 border-ink-900 shadow-hard">
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 px-5 py-3 lg:border-r-2 border-b-2 lg:border-b-0 border-ink-900 bg-ink-900 text-canvas-surface">
            <div
              aria-hidden="true"
              className="w-9 h-9 bg-canvas-surface text-ink-900 border-2 border-canvas-surface flex items-center justify-center font-mono font-bold"
            >
              P
            </div>
            <div className="leading-tight">
              <div className="font-mono text-sm font-bold tracking-widest">PLMS</div>
              <div className="text-[9px] uppercase tracking-[0.3em] opacity-70">Campus Parking</div>
            </div>
          </div>

          {/* Virtual clock */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 lg:border-r-2 border-b-2 lg:border-b-0 border-ink-900">
            <ClockDisplay
              date={now}
              shiftLabel={shiftLabel(shift)}
              speedLabel={speed !== 1 ? `${speed}×` : null}
            />
            {user?.role === 'admin' ? <AdminClockControls /> : null}
          </div>

          {/* Spacer */}
          <div className="hidden lg:block flex-1" />

          {/* Connection + user */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2">
            <ConnectionPill status={connStatus} />
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-[11px] font-bold uppercase tracking-widest">{user.name}</span>
                  <span className="font-mono text-[10px] text-ink-600">
                    {user.roll_number} · {user.role.toUpperCase()}
                  </span>
                </div>
                <RoleBadge role={user.role} />
                <Button variant="ghost" size="sm" icon={LogOut} onClick={onLogout}>
                  Logout
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => navigate('/login')}>
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Sub-nav (role tabs) */}
        <nav aria-label="Primary" className="flex items-stretch bg-canvas-edge border-t-2 border-ink-900 overflow-x-auto">
          {items.map((it) => {
            const Icon = it.icon
            const active = location.pathname === it.to || location.pathname.startsWith(it.to + '/')
            return (
              <NavLink
                key={it.to}
                to={it.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex shrink-0 items-center gap-2 px-5 py-2 min-h-[44px] text-[11px] font-bold uppercase tracking-widest border-r-2 border-ink-900',
                  active
                    ? 'bg-ink-900 text-canvas-surface'
                    : 'bg-canvas-surface text-ink-900 hover:bg-canvas',
                ].join(' ')}
              >
                <Icon aria-hidden="true" className="w-3.5 h-3.5" />
                {it.label}
              </NavLink>
            )
          })}
          <div className="ml-auto hidden md:flex items-center px-4 text-[10px] uppercase tracking-widest text-ink-600 whitespace-nowrap">
            <Clock4 aria-hidden="true" className="w-3 h-3 mr-1" /> Live Mode ·{' '}
            {config.useMockBackend ? 'Mock Backend' : 'Live Backend'}
          </div>
        </nav>
      </header>

      {/* ============================ PAGE BODY ============================ */}
      <main id="plms-main" tabIndex={-1} className="flex-1 px-4 sm:px-6 py-6 w-full page-container">
        {children}
      </main>

      {/* ============================ FOOTER ============================ */}
      <footer className="border-t-2 border-ink-900 bg-canvas-surface px-4 sm:px-6 py-3 text-[10px] uppercase tracking-widest text-ink-600 flex flex-col sm:flex-row gap-1 sm:items-center sm:justify-between">
        <span>PLMS · Industrial Tactile Build · v1.0.0</span>
        <span>Designed for campus parking enforcement</span>
      </footer>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function RoleBadge({ role }) {
  const map = {
    student: { cls: 'bg-olive-600', label: 'Student' },
    guard: { cls: 'bg-slateink-600', label: 'Guard' },
    admin: { cls: 'bg-amber-600', label: 'Admin' },
  }
  const m = map[role] || { cls: 'bg-slateink-600', label: role }
  return (
    <span className={`pill ${m.cls} text-canvas-surface`}>
      <UserCircle2 aria-hidden="true" className="w-3 h-3" />
      {m.label}
    </span>
  )
}

function AdminClockControls() {
  const speed = useClockStore((s) => s.speed)
  const setSpeed = useClockStore((s) => s.setSpeed)
  const jump = useClockStore((s) => s.jump)
  const reset = useClockStore((s) => s.reset)
  const pushToast = useNotificationStore((s) => s.push)

  const speeds = [1, 5, 60]
  const jumps = [
    { label: '+30m', ms: 30 * 60 * 1000 },
    { label: '+2h', ms: 2 * 60 * 60 * 1000 },
    { label: '+6h', ms: 6 * 60 * 60 * 1000 },
  ]

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-stretch border-2 border-ink-900 shadow-hard-sm">
        {speeds.map((sp) => (
          <button
            key={sp}
            onClick={() => {
              setSpeed(sp)
              pushToast({ title: 'Clock Speed', message: `Virtual clock set to ${sp}×`, tone: 'olive' })
            }}
            className={[
              'px-2 py-1 text-[10px] font-bold uppercase tracking-widest border-l-2 border-ink-900 first:border-l-0',
              speed === sp ? 'bg-ink-900 text-canvas-surface' : 'bg-canvas-surface text-ink-900 hover:bg-canvas',
            ].join(' ')}
          >
            {sp}×
          </button>
        ))}
      </div>
      <div className="flex items-stretch border-2 border-ink-900 shadow-hard-sm">
        {jumps.map((j) => (
          <button
            key={j.label}
            onClick={() => {
              jump(j.ms)
              pushToast({ title: 'Clock Jump', message: `Advanced virtual clock by ${j.label}`, tone: 'amber' })
            }}
            className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-canvas-surface hover:bg-canvas border-l-2 border-ink-900 first:border-l-0"
          >
            {j.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          reset()
          pushToast({ title: 'Clock Reset', message: 'Virtual clock returned to real time', tone: 'default' })
        }}
        className="btn-hard btn-hard-sm"
      >
        Reset
      </button>
    </div>
  )
}

export default AppShell
