/**
 * LoginPage.jsx
 * --------------------------------------------------------------------------
 * Industrial Tactile login form with:
 *   - Standard credential entry (roll no / email + password)
 *   - Quick Demo Switcher: one-click login for the 4 demo personas
 *   - Stamped demo cards showing role + risk profile
 *
 * On success the user is redirected to the dashboard appropriate for their
 * role. The auth store handles persistence via Zustand's `persist` middleware.
 */

import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  KeyRound,
  User,
  GraduationCap,
  ShieldCheck,
  Wrench,
  Banknote,
  LogIn,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
} from 'lucide-react'

import { useAuthStore, DEMO_USERS, LIVE_DEMO_EMAILS } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import api from '@/services/api'
import config from '@/config'
import {
  Button,
  Card,
  Field,
  HazardBanner,
  Input,
  Modal,
} from '@/components/ui'

const DEMO_CARDS = [
  {
    key: 'student-good',
    role: 'Student',
    title: 'Demo Student',
    subtitle: 'Good Standing',
    description: 'No fines. Can browse, reserve, and park freely.',
    icon: GraduationCap,
    accent: 'olive',
  },
  {
    key: 'student-fined',
    role: 'Student',
    title: 'Demo Student',
    subtitle: 'Has Unpaid Fines',
    description: '₹400 outstanding. Hard-blocked from booking.',
    icon: Banknote,
    accent: 'amber',
  },
  {
    key: 'student-flagged',
    role: 'Student',
    title: 'Demo Student',
    subtitle: 'Flagged Authority',
    description: '₹1,200 unpaid. Profile flagged — blocked.',
    icon: AlertTriangle,
    accent: 'crimson',
  },
  {
    key: 'guard',
    role: 'Guard',
    title: 'Demo Guard',
    subtitle: 'Lot A Gate',
    description: 'Check-in/out vehicles, flag overstays.',
    icon: ShieldCheck,
    accent: 'slateink',
  },
  {
    key: 'admin',
    role: 'Admin',
    title: 'Demo Campus Admin',
    subtitle: 'Operations',
    description: 'Campus metrics, virtual clock, audit log.',
    icon: Wrench,
    accent: 'amber',
  },
]

const ROUTE_BY_ROLE = {
  student: '/student',
  guard: '/guard',
  admin: '/admin',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const quickLogin = useAuthStore((s) => s.quickLogin)
  const login = useAuthStore((s) => s.login)
  const authLoading = useAuthStore((s) => s.loading)
  const pushToast = useNotificationStore((s) => s.push)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const fromPath = location.state?.from

  const onLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      const user = await login(identifier, password)
      const target = fromPath || ROUTE_BY_ROLE[user.role] || '/'
      pushToast({ title: 'Welcome back', message: `Signed in as ${user.name}`, tone: 'olive' })
      navigate(target, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onDemo = async (key) => {
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      const user = await quickLogin(key)
      const target = fromPath || ROUTE_BY_ROLE[user.role] || '/'
      pushToast({
        title: config.useMockBackend ? 'Demo session' : 'Signed in',
        message: `Switched into ${user.name} (${user.role})`,
        tone: user.is_flagged ? 'crimson' : 'olive',
      })
      navigate(target, { replace: true })
    } catch (err) {
      setError(err.message || 'Demo login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top stamp bar */}
      <div className="bg-ink-900 text-canvas-surface px-6 py-3 flex items-center justify-between border-b-2 border-ink-900">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-canvas-surface text-ink-900 border-2 border-canvas-surface flex items-center justify-center font-mono font-bold">
            P
          </div>
          <div className="leading-tight">
            <div className="font-mono text-base font-bold tracking-widest">PLMS</div>
            <div className="text-[10px] uppercase tracking-[0.3em] opacity-70">
              Campus Parking Slot Management
            </div>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-[0.3em] opacity-80">
          Industrial Tactile Build · v1.0
        </span>
      </div>

      <div className="flex-1 flex items-start justify-center p-6 lg:p-12">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ============================ LEFT — CREDENTIALS ============================ */}
          <Card title="Credentialed Sign-In" subtitle="Roll No / Email + Password" accent="olive" className="w-full">
            <div className="space-y-4">
              <p className="text-xs text-ink-600 leading-relaxed">
                Sign in with your campus credentials.{' '}
                {config.useMockBackend ? (
                  <>
                    Default password for demo accounts is <span className="font-mono font-bold">demo</span>.
                  </>
                ) : (
                  <>
                    Live backend — use a seeded account, e.g. <span className="font-mono font-bold">alex@campus.edu / alex123</span>{' '}
                    (admin: <span className="font-mono font-bold">admin@campus.edu / admin123</span>, guard:{' '}
                    <span className="font-mono font-bold">guard@campus.edu / guard123</span>).
                  </>
                )}
              </p>

              <form onSubmit={onLogin} className="space-y-3">
                <Field label="Roll No / Email">
                  <Input
                    icon={User}
                    placeholder="CSE2024-031 or name@campus.edu"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                  />
                </Field>
                <Field label="Password">
                  <Input
                    icon={KeyRound}
                    type="password"
                    placeholder="•••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>

                {error ? (
                  <HazardBanner tone="crimson" icon={AlertTriangle}>
                    {error}
                  </HazardBanner>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  icon={LogIn}
                  loading={submitting || authLoading}
                  className="w-full justify-center"
                >
                  Sign In
                </Button>
              </form>

              <div className="border-t-2 border-ink-100 pt-3 text-[10px] text-ink-600 leading-relaxed">
                <span className="font-bold uppercase tracking-widest">Tip — </span>
                {config.useMockBackend ? (
                  <>
                    Use any seeded email (e.g. <span className="font-mono">admin@campus.edu</span>) with
                    password <span className="font-mono">demo</span> to walk through the entire flow.
                  </>
                ) : (
                  <>
                    Live backend — seeded logins are <span className="font-mono">alex@campus.edu / alex123</span>,{' '}
                    <span className="font-mono">priya@campus.edu / priya123</span>,{' '}
                    <span className="font-mono">admin@campus.edu / admin123</span>. One-click demo cards sign you in for real.
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* ============================ RIGHT — DEMO QUICK SWITCHER ============================ */}
          <Card title="Demo Quick Switcher" subtitle="One-click role login" accent="amber" className="w-full">
            <p className="text-xs text-ink-600 mb-4">
              Pick a persona to instantly assume their identity — including outstanding fines,
              flagged profiles, and admin powers.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_CARDS.map((card) => {
                const Icon = card.icon
                const accentBar = {
                  olive: 'bg-olive-600',
                  amber: 'bg-amber-600',
                  crimson: 'bg-crimson-600',
                  slateink: 'bg-slateink-600',
                }[card.accent]
                return (
                  <button
                    key={card.key}
                    onClick={() => onDemo(card.key)}
                    disabled={submitting}
                    className="card-hard text-left p-3 relative hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-hard-lg transition-all"
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 ${accentBar}`} />
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-9 h-9 border-2 border-ink-900 flex items-center justify-center ${accentBar} text-canvas-surface`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-ink-600">
                            {card.role}
                          </span>
                          <span className="pill bg-ink-900 text-canvas-surface">
                            {config.useMockBackend
                              ? DEMO_USERS[card.key].email.split('@')[0]
                              : (LIVE_DEMO_EMAILS[card.key] || '').split('@')[0]}
                          </span>
                        </div>
                        <div className="text-sm font-bold leading-tight">{card.title}</div>
                        <div className="text-[11px] uppercase tracking-widest text-ink-600">
                          {card.subtitle}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-ink-600 mt-2 leading-snug">
                      {config.useMockBackend ? card.description : `Live sign-in as ${LIVE_DEMO_EMAILS[card.key]}.`}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 p-3 bg-canvas border-2 border-ink-900 text-[11px] text-ink-600 leading-relaxed">
              <div className="flex items-center gap-2 font-bold uppercase tracking-widest text-ink-900 mb-1">
                <CircleDot className="w-3 h-3 text-olive-600" /> What changes between personas?
              </div>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>
                  <span className="font-bold">Student (Good)</span> — Reservations always allowed.
                </li>
                <li>
                  <span className="font-bold">Student (Fined)</span> — Hard block modal on every reservation.
                </li>
                <li>
                  <span className="font-bold">Student (Flagged)</span> — Authority flag, escalated fines.
                </li>
                <li>
                  <span className="font-bold">Guard</span> — Gate tools + overstay queue.
                </li>
                <li>
                  <span className="font-bold">Admin</span> — Campus metrics, clock + audit log.
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>

      <footer className="bg-ink-900 text-canvas-surface px-6 py-3 text-[10px] uppercase tracking-widest flex items-center justify-between">
        <span>© Campus Operations Center</span>
        <span>PLMS · Industrial Tactile</span>
      </footer>
    </div>
  )
}

// Avoid unused import noise during build
void Modal
void CheckCircle2
