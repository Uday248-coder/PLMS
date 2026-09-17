/**
 * notificationStore.js
 * --------------------------------------------------------------------------
 * Lightweight toast queue. Used to surface booking confirmations, fine
 * alerts, hard block warnings, etc. The ToastViewport component reads from
 * this store and renders the floating notifications.
 */

import { create } from 'zustand'

let nextId = 1

export const useNotificationStore = create((set, get) => ({
  toasts: [],

  /**
   * Push a toast.
   * @param {{title?: string, message: string, tone?: 'default'|'olive'|'amber'|'crimson', timeout?: number}} toast
   */
  push(toast) {
    const id = nextId++
    const item = {
      id,
      title: toast.title,
      message: toast.message,
      tone: toast.tone || 'default',
      timeout: toast.timeout ?? 4500,
    }
    set({ toasts: [...get().toasts, item] })
    if (item.timeout > 0) {
      setTimeout(() => get().dismiss(id), item.timeout)
    }
    return id
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  clear() {
    set({ toasts: [] })
  },
}))

export default useNotificationStore
