/**
 * primitives.jsx
 * --------------------------------------------------------------------------
 * Reusable Industrial Tactile UI building blocks. Every primitive is:
 *   - Hard-edged (2px ink border)
 *   - Drop-shadowed (5px 5px 0 ink)
 *   - Monospaced for IDs / currency / clocks
 *   - Additive in state — never hides information
 */

import React, { useEffect, useId, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { toneClasses, tokenFor } from './statusTokens'

/* --------------------------------------------------------------------------
 * Button — extends the .btn-hard utility with sensible variant mapping.
 * -------------------------------------------------------------------------- */
export function Button({
  as: Comp = 'button',
  variant = 'default', // default | primary | warning | danger | locked | ghost
  size = 'md', // md | sm
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className = '',
  children,
  ...rest
}) {
  const variantClass = {
    default: '',
    primary: 'btn-primary',
    warning: 'btn-warning',
    danger: 'btn-danger',
    locked: 'btn-locked',
    ghost: 'btn-ghost',
  }[variant]

  const sizeClass = size === 'sm' ? 'btn-hard-sm' : ''
  const isLoading = Boolean(loading)
  return (
    <Comp
      className={`btn-hard min-h-[44px] ${sizeClass} ${variantClass} ${className}`}
      disabled={rest.disabled || isLoading}
      aria-busy={isLoading || undefined}
      aria-disabled={rest.disabled || isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className="w-4 h-4" />
      ) : null}
      {children}
      {IconRight ? <IconRight aria-hidden="true" className="w-4 h-4" /> : null}
    </Comp>
  )
}

/* --------------------------------------------------------------------------
 * Card — bordered, shadowed surface. Optional header / footer slots.
 * -------------------------------------------------------------------------- */
export function Card({ className = '', children, title, subtitle, icon: Icon, accent = 'default', ...rest }) {
  const accentBar = {
    olive: 'before:bg-olive-600',
    amber: 'before:bg-amber-600',
    crimson: 'before:bg-crimson-600',
    slateink: 'before:bg-slateink-600',
    default: '',
  }[accent]

  return (
    <section
      className={`card-hard relative ${accent !== 'default' ? `before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${accentBar}` : ''} ${className}`}
      {...rest}
    >
      {(title || Icon) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-ink-900 bg-canvas">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="w-4 h-4" /> : null}
            <h3 className="text-xs font-bold uppercase tracking-[0.22em]">{title}</h3>
          </div>
          {subtitle ? (
            <span className="text-[10px] font-mono uppercase tracking-widest text-ink-600">
              {subtitle}
            </span>
          ) : null}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/* --------------------------------------------------------------------------
 * Badge / Pill — small status indicator with tone color.
 * -------------------------------------------------------------------------- */
export function Badge({ tone = 'slateink', icon: Icon, children, className = '' }) {
  const c = toneClasses(tone)
  return (
    <span
      className={`pill ${c.bg} text-canvas-surface ${className}`}
    >
      {Icon ? <Icon className="w-3 h-3" /> : null}
      <span>{children}</span>
    </span>
  )
}

export function StatusBadge({ status, className = '' }) {
  const token = tokenFor(status)
  const Icon = token.icon
  return (
    <Badge tone={token.tone} icon={Icon} className={className}>
      {token.label}
    </Badge>
  )
}

/* --------------------------------------------------------------------------
 * Modal — industrial slide-down with hard shadow + cross hatch backdrop.
 * -------------------------------------------------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md', // sm | md | lg | xl
  accent = 'default',
  hideClose = false,
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef(null)
  const prevFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement
    const panel = panelRef.current

    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : []

    // Focus first control (or panel) on open
    const t = window.setTimeout(() => {
      const [first] = focusables()
      ;(first || panel)?.focus?.()
    }, 30)

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
      prevFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size]

  const accentBar = {
    olive: 'bg-olive-600',
    amber: 'bg-amber-600',
    crimson: 'bg-crimson-600',
    slateink: 'bg-slateink-600',
    default: 'bg-ink-900',
  }[accent]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      {/* Backdrop with diagonal ink grid */}
      <div
        className="absolute inset-0 bg-ink-900/70 backdrop-grayscale"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(17,17,17,0.85) 0, rgba(17,17,17,0.85) 8px, rgba(17,17,17,0.55) 8px, rgba(17,17,17,0.55) 16px)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative card-hard w-full ${widthClass} animate-fade-in-up max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-2 ${accentBar}`} aria-hidden="true" />
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b-2 border-ink-900">
          <div>
            <h2 id={titleId} className="text-sm font-bold uppercase tracking-[0.22em]">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-xs text-ink-600">
                {description}
              </p>
            ) : null}
          </div>
          {!hideClose && (
            <button
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] w-11 h-11 border-2 border-ink-900 bg-canvas-surface hover:bg-crimson-600 hover:text-canvas-surface flex items-center justify-center transition-colors"
              aria-label={`Close ${title}`}
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          )}
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Input / Select / Textarea — wrapped form controls with hard utility look.
 * -------------------------------------------------------------------------- */
export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className="label-hard">{label}</span> : null}
      {children}
      {hint && !error ? <span className="block mt-1 text-[10px] text-ink-600">{hint}</span> : null}
      {error ? (
        <span className="block mt-1 text-[10px] font-bold uppercase tracking-wider text-crimson-700">
          {error}
        </span>
      ) : null}
    </label>
  )
}

export const Input = React.forwardRef(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`input-hard ${className}`} {...rest} />
})

export const Textarea = React.forwardRef(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`input-hard ${className}`} {...rest} />
})

export const Select = React.forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`input-hard pr-8 ${className}`} {...rest}>
      {children}
    </select>
  )
})

/* --------------------------------------------------------------------------
 * HazardBanner — diagonal stripe band with inline alert text.
 * -------------------------------------------------------------------------- */
export function HazardBanner({ tone = 'amber', icon: Icon = AlertTriangle, children, className = '' }) {
  const stripeClass = tone === 'crimson' ? 'hazard-stripe-crimson' : 'hazard-stripe-bg'
  return (
    <div
      role={tone === 'crimson' ? 'alert' : 'status'}
      className={`relative overflow-hidden border-2 border-ink-900 shadow-hard ${className}`}
    >
      <div aria-hidden="true" className={`absolute inset-0 ${stripeClass} animate-hazard-stripes opacity-90`} />
      <div className="relative bg-canvas-surface/95 px-4 py-3 flex items-start gap-3 border-2 border-transparent">
        <Icon aria-hidden="true" className={`w-5 h-5 mt-0.5 ${tone === 'crimson' ? 'text-crimson-700' : 'text-amber-700'}`} />
        <div className="text-sm font-semibold text-ink-900">{children}</div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * MetricCard — top-level metric used in admin/guard dashboards.
 * -------------------------------------------------------------------------- */
export function MetricCard({ icon: Icon, label, value, sublabel, tone = 'default', footer }) {
  const c = toneClasses(tone)
  return (
    <div className="card-hard p-4 flex flex-col gap-2 min-h-[112px] relative">
      <div className="flex items-start justify-between">
        <span className="label-hard">{label}</span>
        {Icon ? (
          <span className={`w-8 h-8 flex items-center justify-center border-2 border-ink-900 ${c.bg} text-canvas-surface`}>
            <Icon className="w-4 h-4" />
          </span>
        ) : null}
      </div>
      <div className="font-mono text-3xl font-bold text-ink-900 leading-none">
        {value}
      </div>
      {sublabel ? <div className="text-[11px] uppercase tracking-widest text-ink-600">{sublabel}</div> : null}
      {footer ? <div className="pt-2 mt-auto border-t border-ink-100 text-[11px] text-ink-600">{footer}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * ClockDisplay — high-density monospace digital clock + shift label.
 * -------------------------------------------------------------------------- */
export function ClockDisplay({ date, shiftLabel, speedLabel, className = '' }) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    <div className={`flex items-stretch border-2 border-ink-900 shadow-hard-sm ${className}`}>
      <div className="bg-ink-900 text-canvas-surface font-mono px-3 py-2 flex flex-col items-center justify-center">
        <ClockIcon className="w-4 h-4" />
        <span className="text-[9px] tracking-widest mt-0.5">V-CLOCK</span>
      </div>
      <div className="bg-canvas-surface px-4 py-2 flex flex-col items-start justify-center min-w-[180px]">
        <span className="font-mono text-2xl font-bold tracking-tight tabular-nums">
          {pad(date.getHours())}:{pad(date.getMinutes())}:{pad(date.getSeconds())}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-600">
          {shiftLabel}
          {speedLabel ? <> · {speedLabel}</> : null}
        </span>
      </div>
    </div>
  )
}

function ClockIcon({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/* --------------------------------------------------------------------------
 * ConnectionPill — WebSocket status indicator.
 * -------------------------------------------------------------------------- */
export function ConnectionPill({ status = 'CONNECTED', className = '' }) {
  const tone =
    status === 'CONNECTED'
      ? 'bg-olive-600'
      : status === 'RECONNECTING'
        ? 'bg-amber-600 animate-pulse-amber'
        : 'bg-crimson-600'

  return (
    <span
      role="status"
      aria-live="polite"
      className={`pill text-canvas-surface ${tone} ${className}`}
      title={`Realtime channel: ${status}`}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-canvas-surface" />
      {status}
    </span>
  )
}

/* --------------------------------------------------------------------------
 * SlotTile — the centerpiece of the dashboard grid.
 * Implements the additive-state rule: never fade, always overlay.
 * -------------------------------------------------------------------------- */
export function SlotTile({ slot, onClick, active = false, compact = false }) {
  const token = tokenFor(slot.status)
  const Icon = token.icon
  const isOverstay = slot.status === 'OVERSTAY'
  const isClosed = slot.status === 'CLOSED' || slot.status === 'MAINTENANCE'
  const isBookedOrParked = ['BOOKED', 'PARKED'].includes(slot.status)
  const animate = token.animate || ''
  const label = `Slot ${slot.slot_number}, ${slot.slot_type}, ${token.label}${slot.vehicle_plate ? `, ${slot.vehicle_plate}` : ''}`

  return (
    <button
      type="button"
      onClick={() => onClick?.(slot)}
      aria-label={label}
      aria-pressed={active || undefined}
      className={[
        'relative w-full min-h-[44px] text-left bg-canvas-surface border-2 border-ink-900 shadow-hard',
        'transition-[transform,box-shadow] duration-150 ease-out',
        'hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-hard-lg',
        'active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-press',
        active ? 'translate-x-[1px] translate-y-[1px] shadow-hard-press' : '',
        animate,
        compact ? 'p-2 min-h-[96px]' : 'p-3 min-h-[128px]',
      ].join(' ')}
    >
      {/* Status badge — top right */}
      <span
        className={`absolute top-1.5 right-1.5 stamp ${token.tone === 'olive' ? 'bg-olive-600 text-canvas-surface' : ''} ${token.tone === 'amber' ? 'bg-amber-600 text-canvas-surface' : ''} ${token.tone === 'crimson' ? 'bg-crimson-600 text-canvas-surface animate-pulse' : ''} ${token.tone === 'slateink' ? 'bg-slateink-600 text-canvas-surface' : ''}`}
      >
        {token.stamp}
      </span>

      {/* Slot ID — top left, mono */}
      <div className="font-mono text-base font-bold tracking-tight text-ink-900">
        {slot.slot_number}
      </div>

      {/* Type icon row */}
      <div className="mt-1 flex items-center gap-1.5 text-ink-600">
        <SlotTypeIcon type={slot.slot_type} className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-widest font-bold">{slot.slot_type}</span>
      </div>

      {/* Optional plate or note */}
      {slot.vehicle_plate ? (
        <div className="mt-1 font-mono text-[11px] text-ink-900 truncate">
          {slot.vehicle_plate}
        </div>
      ) : null}

      {/* Hazard stripes overlay for overstay (additive!) */}
      {isOverstay ? (
        <div className="pointer-events-none absolute inset-0 border-2 border-crimson-600">
          <div className="absolute inset-0 hazard-stripe-crimson opacity-25 animate-hazard-stripes" />
        </div>
      ) : null}

      {/* Closed lock overlay */}
      {isClosed ? (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 text-slateink-700">
          <Lock className="w-3 h-3" />
          <span className="text-[9px] uppercase tracking-widest font-bold">{token.label}</span>
        </div>
      ) : null}

      {/* Booked overlay */}
      {isBookedOrParked ? (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1">
          <Icon className="w-3 h-3 text-ink-900" />
        </div>
      ) : null}
    </button>
  )
}

export function SlotTypeIcon({ type, className = '' }) {
  // Local SVG icons to avoid heavy lucide deps for the small variations.
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'square',
    strokeLinejoin: 'miter',
  }
  switch (type) {
    case 'car':
      return (
        <svg {...common}>
          <path d="M3 13l2-6a2 2 0 0 1 2-1.5h10A2 2 0 0 1 19 7l2 6" />
          <rect x="3" y="13" width="18" height="5" />
          <circle cx="7" cy="18.5" r="1.5" />
          <circle cx="17" cy="18.5" r="1.5" />
        </svg>
      )
    case 'bike':
      return (
        <svg {...common}>
          <circle cx="6" cy="17" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="M6 17l3-7h6l3 7M9 10h6" />
        </svg>
      )
    case 'ev':
      return (
        <svg {...common}>
          <path d="M11 4l-3 7h5l-3 9 8-11h-5l3-5z" />
        </svg>
      )
    case 'handicap':
      return (
        <svg {...common}>
          <circle cx="9" cy="5" r="1.5" />
          <path d="M9 7v5h4l2 6M9 12l-2 3" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" />
        </svg>
      )
  }
}

function Lock({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <rect x="5" y="11" width="14" height="9" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/* --------------------------------------------------------------------------
 * ToggleGroup — segmented control for lot / shift selection.
 * -------------------------------------------------------------------------- */
export function ToggleGroup({ options, value, onChange, className = '', label }) {
  return (
    <div
      role="group"
      aria-label={label || 'Filter options'}
      className={`inline-flex flex-wrap border-2 border-ink-900 shadow-hard-sm bg-canvas-surface ${className}`}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(opt.value)}
            className={[
              'min-h-[44px] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors',
              active ? 'bg-ink-900 text-canvas-surface' : 'bg-canvas-surface text-ink-900 hover:bg-canvas-edge',
              idx > 0 ? 'border-l-2 border-ink-900' : '',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Empty state — neutral fill for empty tables / lists.
 * -------------------------------------------------------------------------- */
export function EmptyState({ icon: Icon, title, hint, className = '' }) {
  return (
    <div className={`card-flat px-4 py-8 text-center flex flex-col items-center gap-2 ${className}`}>
      {Icon ? <Icon className="w-6 h-6 text-ink-600" /> : null}
      <div className="text-sm font-bold uppercase tracking-widest text-ink-900">{title}</div>
      {hint ? <div className="text-xs text-ink-600 max-w-sm">{hint}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Toast — internal toast renderer for the notification store.
 * -------------------------------------------------------------------------- */
export function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[min(320px,calc(100vw-2rem))]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`card-hard p-3 flex items-start gap-2 animate-fade-in-up ${
            t.tone === 'crimson'
              ? 'border-crimson-600'
              : t.tone === 'olive'
                ? 'border-olive-600'
                : t.tone === 'amber'
                  ? 'border-amber-600'
                  : ''
          }`}
        >
          <div className="flex-1">
            {t.title ? (
              <div className="text-[11px] uppercase tracking-widest font-bold">{t.title}</div>
            ) : null}
            <div className="text-xs text-ink-600 mt-0.5">{t.message}</div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="min-w-[44px] min-h-[44px] w-11 h-11 shrink-0 border-2 border-ink-900 bg-canvas-surface hover:bg-ink-900 hover:text-canvas-surface flex items-center justify-center"
            aria-label={t.title ? `Dismiss: ${t.title}` : 'Dismiss notification'}
          >
            <X aria-hidden="true" className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------------
 * AuditRow — one-line system log entry used in admin dashboard.
 * -------------------------------------------------------------------------- */
export function AuditRow({ entry }) {
  const tone =
    entry.severity === 'critical'
      ? 'border-crimson-600'
      : entry.severity === 'warning'
        ? 'border-amber-600'
        : 'border-ink-100'

  return (
    <div className={`flex items-center gap-3 px-3 py-2 border-l-4 ${tone} bg-canvas-surface hover:bg-canvas`}>
      <span className="font-mono text-[11px] tabular-nums text-ink-600 min-w-[110px]">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>
      <span className="text-[10px] uppercase tracking-widest font-bold min-w-[60px]">
        {entry.actor_role}
      </span>
      <span className="font-mono text-xs flex-1 truncate">{entry.action}</span>
      <span className="text-[10px] text-ink-600 truncate max-w-[180px]">{entry.details}</span>
    </div>
  )
}
