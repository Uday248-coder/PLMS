/**
 * useWebSocket.js
 * --------------------------------------------------------------------------
 * Tiny subscription hook for WebSocket events. Consumers register a
 * callback and receive every event the realtime channel pushes. The
 * subscription is cleaned up automatically on unmount.
 *
 * Usage:
 *   useWebSocket((evt) => { if (evt.type === 'SLOT_UPDATED') ... })
 */

import { useEffect, useRef } from 'react'
import { subscribe } from '@/services/websocket'

export function useWebSocket(handler) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  }, [handler])

  useEffect(() => {
    return subscribe((event) => {
      if (ref.current) ref.current(event)
    })
  }, [])
}

export default useWebSocket
