/**
 * RequireAuth.jsx
 * --------------------------------------------------------------------------
 * Route guard. Renders children only when a session exists, optionally
 * restricted to a specific role. Otherwise redirects to /login or renders
 * a "Forbidden" panel for role mismatches.
 */

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui'

export function RequireAuth({ roles, children }) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const user = useAuthStore((s) => s.user)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card title="403 — Forbidden" accent="crimson" className="max-w-md w-full">
          <p className="text-sm text-ink-600 mb-4">
            Your role <span className="font-mono font-bold uppercase">{user?.role}</span> isn't
            permitted to view this section. Switch profiles or contact an administrator.
          </p>
          <a href="/" className="btn-hard btn-primary btn-hard-sm">Back to dashboard</a>
        </Card>
      </div>
    )
  }

  return children
}

export default RequireAuth
