import asyncio
import uuid
from datetime import datetime, timedelta

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions


class Session:
    def __init__(self, session_id: str, options: ClaudeAgentOptions, settings):
        self.id = session_id
        self.title = "New Chat"
        self._options = options
        self._settings = settings
        self._client: ClaudeSDKClient | None = None
        self.messages: list[dict] = []
        self.created_at = datetime.now()
        self.last_active = datetime.now()
        self._query_lock = asyncio.Lock()

    async def start(self):
        self._client = ClaudeSDKClient(options=self._options)
        await self._client.__aenter__()

    async def stop(self):
        if self._client:
            await self._client.__aexit__(None, None, None)
            self._client = None

    async def send_query(self, prompt: str):
        if not self._client:
            raise RuntimeError("Session not started")
        async with self._query_lock:
            self.last_active = datetime.now()
            self.messages.append({"role": "user", "content": prompt})
            await self._client.query(prompt)
            async for msg in self._client.receive_response():
                block = self._classify_message(msg)
                if block:
                    self.messages.append(block)
                    yield block

    async def interrupt(self):
        if self._client:
            await self._client.interrupt()

    def _classify_message(self, msg) -> dict | None:
        type_name = type(msg).__name__
        if type_name == "AssistantMessage":
            blocks = []
            for block in msg.content:
                b = self._classify_message(block)
                if b:
                    blocks.append(b)
            result = {"type": "assistant", "blocks": blocks} if blocks else None
            if result and msg.stop_reason:
                result["stop_reason"] = msg.stop_reason
            return result
        elif type_name == "StreamEvent":
            return self._classify_stream_event(msg)
        elif type_name == "TextBlock":
            return {"type": "text", "text": msg.text}
        elif type_name == "ThinkingBlock":
            return {"type": "thinking", "thinking": msg.thinking}
        elif type_name == "ToolUseBlock":
            return {"type": "tool_use", "name": msg.name, "input": msg.input}
        elif type_name == "ToolResultBlock":
            return {"type": "tool_result", "content": self._format_content(msg.content)}
        elif type_name == "ServerToolUseBlock":
            return {"type": "tool_use", "name": msg.name, "input": msg.input}
        elif type_name == "ServerToolResultBlock":
            return {"type": "tool_result", "content": self._format_content(msg.content)}
        elif type_name == "ResultMessage":
            return {"type": "result", "result": str(msg.result), "usage": str(msg.usage)}
        return None

    @staticmethod
    def _format_content(content) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
                else:
                    parts.append(str(item))
            return "\n".join(parts)
        return str(content)

    def _classify_stream_event(self, msg) -> dict | None:
        event = msg.event
        delta = event.get("delta", event)
        event_type = event.get("type", "")
        if event_type == "content_block_delta":
            delta_type = delta.get("type", "")
            if delta_type == "text_delta":
                return {"type": "text", "text": delta.get("text", "")}
            elif delta_type == "input_json_delta":
                return {"type": "tool_input_delta", "partial_json": delta.get("partial_json", "")}
            elif delta_type == "thinking_delta":
                return {"type": "thinking", "thinking": delta.get("thinking", "")}
        return None


class SessionManager:
    def __init__(self, settings):
        self._sessions: dict[str, Session] = {}
        self._settings = settings
        self._cleanup_task: asyncio.Task | None = None

    def _make_options(self) -> ClaudeAgentOptions:
        return ClaudeAgentOptions(
            system_prompt=self._settings.system_prompt,
            allowed_tools=self._settings.allowed_tools,
            permission_mode=self._settings.permission_mode,
            model=self._settings.model,
            include_partial_messages=True,
        )

    async def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        session = Session(session_id, self._make_options(), self._settings)
        await session.start()
        self._sessions[session_id] = session
        return session_id

    async def delete_session(self, session_id: str):
        session = self._sessions.pop(session_id, None)
        if session:
            await session.stop()

    def get_session(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def list_sessions(self) -> list[dict]:
        return [
            {"id": s.id, "title": s.title, "created_at": s.created_at.isoformat()}
            for s in self._sessions.values()
        ]

    async def cleanup_stale(self):
        while True:
            await asyncio.sleep(60)
            cutoff = datetime.now() - timedelta(minutes=self._settings.session_timeout_minutes)
            stale = [sid for sid, s in self._sessions.items() if s.last_active < cutoff]
            for sid in stale:
                await self.delete_session(sid)

    async def start_cleanup(self):
        self._cleanup_task = asyncio.create_task(self.cleanup_stale())

    async def stop_cleanup(self):
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None
        for sid in list(self._sessions.keys()):
            await self.delete_session(sid)
