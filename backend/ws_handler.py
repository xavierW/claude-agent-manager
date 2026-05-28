import json
from fastapi import WebSocket, WebSocketDisconnect

from backend.session_manager import SessionManager


class WebSocketHandler:
    def __init__(self, session_manager: SessionManager):
        self._sm = session_manager

    async def handle(self, websocket: WebSocket):
        await websocket.accept()
        await self._send_sessions(websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "code": "parse_error", "message": "Invalid JSON"})
                    continue
                await self._dispatch(data, websocket)
        except WebSocketDisconnect:
            pass

    async def _dispatch(self, data: dict, ws: WebSocket):
        msg_type = data.get("type")

        if msg_type == "create_session":
            session_id = await self._sm.create_session()
            await ws.send_json({"type": "session_created", "session_id": session_id})
            await self._send_sessions(ws)

        elif msg_type == "delete_session":
            sid = data.get("session_id", "")
            await self._sm.delete_session(sid)
            await ws.send_json({"type": "session_deleted", "session_id": sid})
            await self._send_sessions(ws)

        elif msg_type == "list_sessions":
            await self._send_sessions(ws)

        elif msg_type == "get_history":
            sid = data.get("session_id", "")
            session = self._sm.get_session(sid)
            if session:
                await ws.send_json({
                    "type": "session_history",
                    "session_id": sid,
                    "messages": session.messages,
                })
            else:
                await ws.send_json({
                    "type": "error", "code": "session_not_found",
                    "message": f"Session {sid} not found"
                })

        elif msg_type == "query":
            await self._handle_query(data, ws)

        elif msg_type == "interrupt":
            sid = data.get("session_id", "")
            session = self._sm.get_session(sid)
            if session:
                await session.interrupt()

    async def _handle_query(self, data: dict, ws: WebSocket):
        sid = data.get("session_id", "")
        prompt = data.get("prompt", "").strip()
        if not prompt:
            return

        session = self._sm.get_session(sid)
        if not session:
            await ws.send_json({
                "type": "error", "code": "session_not_found",
                "message": f"Session {sid} not found"
            })
            return

        if session.title == "New Chat":
            session.title = prompt[:60] + ("..." if len(prompt) > 60 else "")

        try:
            async for block in session.send_query(prompt):
                block["session_id"] = sid
                await ws.send_json(block)
            await ws.send_json({"type": "done", "session_id": sid})
            await self._send_sessions(ws)
        except Exception as e:
            await ws.send_json({
                "type": "error", "session_id": sid,
                "code": "query_error", "message": str(e)
            })

    async def _send_sessions(self, ws: WebSocket):
        sessions = self._sm.list_sessions()
        await ws.send_json({"type": "sessions", "sessions": sessions})
