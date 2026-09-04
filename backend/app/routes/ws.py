"""WebSocket channels: per-lot (guard/kiosk) + admin fan-in."""
from fastapi import APIRouter, WebSocket
from ..realtime import hub

router = APIRouter()


@router.websocket("/ws/lot/{lot_id}")
async def lot_channel(ws: WebSocket, lot_id: str):
    await hub.connect(lot_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive; server pushes on changes
    except Exception:
        hub.disconnect(lot_id, ws)


@router.websocket("/ws/admin")
async def admin_channel(ws: WebSocket):
    """Admin subscribes once, gets every lot's events. Guard/kiosk use /ws/lot/{id}."""
    await hub.connect("admin", ws)
    try:
        while True:
            await ws.receive_text()
    except Exception:
        hub.disconnect("admin", ws)
