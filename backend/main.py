from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

from backend.config import Settings
from backend.session_manager import SessionManager
from backend.ws_handler import WebSocketHandler

settings = Settings()
session_manager = SessionManager(settings)
ws_handler = WebSocketHandler(session_manager)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await session_manager.start_cleanup()
    yield
    await session_manager.stop_cleanup()


app = FastAPI(title="Claude Agent Manager", lifespan=lifespan)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_handler.handle(websocket)


frontend_dir = Path(__file__).resolve().parent.parent / "frontend" / "static"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
