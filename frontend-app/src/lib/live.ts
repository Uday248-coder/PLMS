import type { WsMessage } from "../types";

export function liveChannel(
  wsPath: string,
  onMsg: (msg: WsMessage) => void,
  pollFn?: () => void,
  pollMs: number = 5000,
  onStatus?: (connected: boolean) => void
): { stop: () => void } {
  let ws: WebSocket | null = null;
  let connected = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function poll() {
    if (!connected && pollFn) pollFn();
  }

  try {
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(proto + location.host + wsPath);
    ws.onmessage = (ev) => {
      try {
        onMsg(JSON.parse(ev.data));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onopen = () => {
      connected = true;
      onStatus?.(true);
    };
    ws.onclose = () => {
      connected = false;
      onStatus?.(false);
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      connected = false;
    };
  } catch {
    connected = false;
  }

  pollTimer = setInterval(poll, pollMs);

  return {
    stop() {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      if (pollTimer) clearInterval(pollTimer);
    },
  };
}
