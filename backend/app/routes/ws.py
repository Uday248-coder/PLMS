"""WebSocket channels: per-lot (guard/kiosk) + admin fan-in.

Authentication:
  /ws/admin  — requires a valid Bearer JWT as ?token= query param (admin or guard role).
  /ws/lot    — accepts an optional ?token= param; unauthenticated connections are allowed
               so that the public kiosk (walk-in, no login) can still receive live updates.
               Restrict at the network/reverse-proxy level in production.
"""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from ..auth import decode_token
from ..realtime import hub

log = logging.getLogger(__name__)

router = APIRouter()


def _validate_token(token: str | None) -> bool:
    if not token:
        return False
    try:
        decode_token(token)
        return True
    except Exception:
        return False


@router.websocket("/ws/lot/{lot_id}")
async def lot_channel(ws: WebSocket, lot_id: str, token: str | None = Query(default=None)):
    """Per-lot channel used by guard dashboards and kiosks.
    Token is optional — kiosk uses this endpoint without authentication."""
    await hub.connect(lot_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive; server pushes on changes
    except (WebSocketDisconnect, Exception):
        hub.disconnect(lot_id, ws)


@router.websocket("/ws/admin")
async def admin_channel(ws: WebSocket, token: str | None = Query(default=None)):
    """Admin channel: receives every lot's events. Requires a valid JWT."""
    if not _validate_token(token):
        await ws.close(code=4001)
        log.warning("Rejected unauthenticated /ws/admin connection")
        return
    await hub.connect("admin", ws)
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, Exception):
        hub.disconnect("admin", ws)
