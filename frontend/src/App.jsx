/**
 * App.jsx
 * --------------------------------------------------------------------------
 * Root component. Sets up routing, boots the realtime channel, and wraps
 * the authenticated portion of the app in the AppShell chrome.
 *
 * Route map:
 *   /login              — public login + demo role switcher
 *   /student            — Student dashboard (interactive slot grid + active pass)
 *   /student/fines      — Fines & Compliance ledger
 *   /guard              — Guard gate dashboard
 *   /guard/overstays    — Guard overstay queue
 *   /admin              — Admin campus dashboard
 *   /admin/audit        — System audit log
 *   /admin/maintenance  — Slot / lot maintenance tools
 */

import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import { AppShell } from '@/components/AppShell'
import { RequireAuth } from '@/components/RequireAuth'
import { bootWebSocket } from '@/services/websocket'

import LoginPage from '@/pages/LoginPage'
import StudentDashboard from '@/pages/StudentDashboard'
import GuardDashboard from '@/pages/GuardDashboard'
import AdminDashboard from '@/pages/AdminDashboard'
import FinesPage from '@/pages/FinesPage'
import AdminAuditPage from '@/pages/AdminAuditPage'
import AdminMaintenancePage from '@/pages/AdminMaintenancePage'
import GuardOverstaysPage from '@/pages/GuardOverstaysPage'
import { useAuthStore } from '@/store/authStore'

export default function App() {
  useEffect(() => {
    bootWebSocket()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated routes share the AppShell */}
      <Route
        path="/student/*"
        element={
          <RequireAuth roles={['student']}>
            <AppShell>
              <Routes>
                <Route index element={<StudentDashboard />} />
                <Route path="fines" element={<FinesPage />} />
                <Route path="*" element={<Navigate to="/student" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />

      <Route
        path="/guard/*"
        element={
          <RequireAuth roles={['guard', 'admin']}>
            <AppShell>
              <Routes>
                <Route index element={<GuardDashboard />} />
                <Route path="overstays" element={<GuardOverstaysPage />} />
                <Route path="*" element={<Navigate to="/guard" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />

      <Route
        path="/admin/*"
        element={
          <RequireAuth roles={['admin']}>
            <AppShell>
              <Routes>
                <Route index element={<AdminDashboard />} />
                <Route path="audit" element={<AdminAuditPage />} />
                <Route path="maintenance" element={<AdminMaintenancePage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  )
}

function RoleRedirect() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'student') return <Navigate to="/student" replace />
  if (user?.role === 'guard') return <Navigate to="/guard" replace />
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/login" replace />
}
