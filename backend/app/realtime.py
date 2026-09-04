"""WebSocket fan-out, one channel per lot."""
from collections import defaultdict


class LotHub:
    def __init__(self):
        self.channels: dict[str, set] = defaultdict(set)

    async def connect(self, lot_id: str, ws):
        await ws.accept()
        self.channels[lot_id].add(ws)

    def disconnect(self, lot_id: str, ws):
        self.channels[lot_id].discard(ws)

    async def broadcast(self, lot_id: str, message: dict):
        dead = []
        for ws in list(self.channels.get(lot_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(lot_id, ws)


hub = LotHub()


async def notify(lot_id: str, message: dict):
    """Fan-out to per-lot channel AND admin channel (zero-cost, same process)."""
    await hub.broadcast(lot_id, message)
    await hub.broadcast("admin", {"lot_id": lot_id, **message})
