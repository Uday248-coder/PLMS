"""WebSocket fan-out for instantaneous UI synchronization."""
import json
import asyncio
import logging
from collections import defaultdict
from fastapi import WebSocket

log = logging.getLogger(__name__)

class Broadcaster:
    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)
        log.info("Client connected. Total clients: %d", len(self.clients))

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)
        log.info("Client disconnected. Remaining: %d", len(self.clients))

    async def broadcast(self, message: dict):
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

broadcaster = Broadcaster()
main_loop = None

def broadcast_all(message: dict):
    """Thread-safe and async-safe broadcast."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(broadcaster.broadcast(message))
    except RuntimeError:
        if main_loop is not None:
            asyncio.run_coroutine_threadsafe(broadcaster.broadcast(message), main_loop)

async def notify(lot_id: str, message: dict):
    await broadcaster.broadcast({**message, "lot_id": lot_id})
