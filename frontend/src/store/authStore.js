/**
 * authStore.js
 * --------------------------------------------------------------------------
 * Zustand store owning the authenticated session.
 * - Holds the JWT and the current user profile (name, role, fines, etc.)
 * - Exposes `quickLogin(role)` for the demo switcher on the login page
 * - Persists session in localStorage so a refresh doesn't sign the user out
 *
 * The store is wired against the mocked api service by default, so every
 * call below is fully functional offline.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/services/api'
import config from '@/config'

const STORAGE_KEY = 'plms.auth.session'

/** Live-backend seed emails backing each demo persona (see backend/app/seed.py). */
export const LIVE_DEMO_EMAILS = {
  'student-good': 'alex@campus.edu',
  'student-fined': 'priya@campus.edu',
  'student-flagged': 'rohit@campus.edu',
  guard: 'guard@campus.edu',
  admin: 'admin@campus.edu',
}

const demoUsers = {
  'student-good': {
    id: 1,
    name: 'Ananya Sharma',
    roll_number: 'CSE2024-031',
    email: 'student.good@campus.edu',
    vehicle_plate: 'KA-05-HH-2241',
    phone_number: '+91 90000 11122',
    unpaid_fine_total: 0,
    is_flagged: false,
    role: 'student',
  },
  'student-fined': {
    id: 2,
    name: 'Rahul Verma',
    roll_number: 'ECE2023-118',
    email: 'student.fined@campus.edu',
    vehicle_plate: 'KA-05-AB-7732',
    phone_number: '+91 90000 33455',
    unpaid_fine_total: 400,
    is_flagged: false,
    role: 'student',
  },
  'student-flagged': {
    id: 3,
    name: 'Priya Iyer',
    roll_number: 'ME2022-007',
    email: 'student.flagged@campus.edu',
    vehicle_plate: 'KA-05-EF-9911',
    phone_number: '+91 90000 77889',
    unpaid_fine_total: 1200,
    is_flagged: true,
    role: 'student',
  },
  guard: {
    id: 10,
    name: 'Vikram Singh',
    roll_number: 'STAFF-014',
    email: 'guard.lota@campus.edu',
    vehicle_plate: 'CAMPUS-014',
    phone_number: '+91 90000 55001',
    unpaid_fine_total: 0,
    is_flagged: false,
    role: 'guard',
  },
  admin: {
    id: 100,
    name: 'Dr. Kavita Rao',
    roll_number: 'ADMIN-001',
    email: 'admin@campus.edu',
    vehicle_plate: 'ADMIN-001',
    phone_number: '+91 90000 99001',
    unpaid_fine_total: 0,
    is_flagged: false,
    role: 'admin',
  },
}

export const DEMO_USERS = demoUsers

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      loading: false,
      error: null,

      isAuthenticated: () => !!get().token && !!get().user,
      currentRole: () => get().user?.role || null,

      /**
       * Standard email/password login. Calls api.login; falls back to demo
       * matching so the form remains functional in mock mode.
       */
      async login(identifier, password) {
        set({ loading: true, error: null })
        try {
          const res = await api.login(identifier, password)
          if (!res) throw new Error('Invalid credentials')
          set({ token: res.token, user: res.user, loading: false })
          api.setMockSession({ token: res.token, user: res.user })
          return res.user
        } catch (err) {
          set({ error: err.message || 'Login failed', loading: false })
          throw err
        }
      },

      /** One-click demo login — mock session offline, real demo-login against the backend when live. */
      async quickLogin(roleKey) {
        if (!config.useMockBackend) {
          const email = LIVE_DEMO_EMAILS[roleKey]
          if (!email) throw new Error(`Unknown demo role: ${roleKey}`)
          set({ loading: true, error: null })
          try {
            const res = await api.demoLogin(email)
            if (!res?.token || !res?.user) throw new Error('Demo login failed')
            set({ token: res.token, user: res.user, loading: false, error: null })
            api.setMockSession({ token: res.token, user: res.user })
            return res.user
          } catch (err) {
            set({ loading: false, error: err.message || 'Demo login failed' })
            throw err
          }
        }
        const user = demoUsers[roleKey]
        if (!user) throw new Error(`Unknown demo role: ${roleKey}`)
        // Mock token — opaque to the UI, the api.js mock treats it as valid.
        const token = `mock.${user.role}.${user.id}.${Date.now()}`
        set({ token, user, loading: false, error: null })
        // Tell the api mock layer about the active session so subsequent
        // calls resolve to the right user record.
        api.setMockSession({ token, user })
        return user
      },

      /** Update cached user fields (e.g. after paying a fine). */
      patchUser(patch) {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...patch } })
      },

      async refreshMe() {
        try {
          const me = await api.me(get().token)
          if (me) set({ user: me })
        } catch (err) {
          // Silent — keep cached user on transient errors.
        }
      },

      logout() {
        set({ token: null, user: null, error: null })
        api.setMockSession(null)
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.setMockSession({ token: state.token, user: state.user })
        }
      },
    },
  ),
)

export default useAuthStore
