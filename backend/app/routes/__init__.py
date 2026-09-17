"""Route modules for the simplified parking booking system."""
from .auth import router as auth_router
from .ws import router as ws_router
from .api import router as api_router
__all__ = ["auth_router", "ws_router", "api_router"]