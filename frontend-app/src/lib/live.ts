import type { WsMessage } from "../types";

export function liveChannel(
  wsPath: string,
  onMsg: (msg: WsMessage) => void,
  pollFn?: () => void,
  pollMs: number = 5000,
  onStatus?: (connected: boolean) => void,
  token?: string | null
): { stop: () => void } {
  let ws: WebSocket | null = null;
  let connected = false;
  let stopped = false;
  let backoffMs = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function poll() {
    if (!connected && pollFn) pollFn();
  }

  function connect() {
    if (stopped) return;
    try {
      // Split-deploy: derive the WS endpoint from VITE_API_URL when set
      // (e.g. https://parking-backend.onrender.com -> wss://parking-backend.onrender.com).
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
      let url: string;
      if (apiBase) {
        const wsBase = apiBase.replace(/^http/, "ws");
        url = `${wsBase}${wsPath}`;
      } else {
        const proto = location.protocol === "https:" ? "wss://" : "ws://";
        url = `${proto}${location.host}${wsPath}`;
      }
      if (token) url += `?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          onMsg(JSON.parse(ev.data));
        } catch {
          /* ignore malformed */
        }
      };

      ws.onopen = () => {
        connected = true;
        backoffMs = 1000;
        onStatus?.(true);
      };

      ws.onclose = () => {
        if (connected) {
          connected = false;
          onStatus?.(false);
        }
        if (!stopped) {
          reconnectTimer = setTimeout(() => {
            backoffMs = Math.min(backoffMs * 2, 30000);
            connect();
          }, backoffMs);
        }
      };

      ws.onerror = () => {
        try { ws?.close(); } catch { /* noop */ }
      };
    } catch {
      connected = false;
      if (!stopped) {
        reconnectTimer = setTimeout(() => {
          backoffMs = Math.min(backoffMs * 2, 30000);
          connect();
        }, backoffMs);
      }
    }
  }

  connect();
  pollTimer = setInterval(poll, pollMs);

  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      try { ws?.close(); } catch { /* noop */ }
    },
  };
}
