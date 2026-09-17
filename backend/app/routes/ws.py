"""WebSocket live event channel."""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..realtime import broadcaster

log = logging.getLogger(__name__)
router = APIRouter(tags=["realtime"])

@router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await broadcaster.connect(websocket)
    try:
        while True:
            # Keep-alive receive ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
    except Exception:
        broadcaster.disconnect(websocket)

@router.websocket("/ws/{lot_id}")
async def websocket_lot_endpoint(websocket: WebSocket, lot_id: str):
    await broadcaster.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
    except Exception:
        broadcaster.disconnect(websocket)
