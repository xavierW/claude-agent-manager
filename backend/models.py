from __future__ import annotations

from pydantic import BaseModel
from typing import Literal, Optional


# --- Client → Server ---

class CreateSession(BaseModel):
    type: Literal["create_session"] = "create_session"


class DeleteSession(BaseModel):
    type: Literal["delete_session"]
    session_id: str


class ListSessions(BaseModel):
    type: Literal["list_sessions"] = "list_sessions"


class GetHistory(BaseModel):
    type: Literal["get_history"]
    session_id: str


class QueryMessage(BaseModel):
    type: Literal["query"]
    session_id: str
    prompt: str


class Interrupt(BaseModel):
    type: Literal["interrupt"]
    session_id: str


# --- Server → Client ---

class SessionCreated(BaseModel):
    type: Literal["session_created"] = "session_created"
    session_id: str


class SessionDeleted(BaseModel):
    type: Literal["session_deleted"] = "session_deleted"
    session_id: str


class SessionsList(BaseModel):
    type: Literal["sessions"] = "sessions"
    sessions: list[dict]


class SessionHistory(BaseModel):
    type: Literal["session_history"] = "session_history"
    session_id: str
    messages: list[dict]


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    session_id: Optional[str] = None
    code: str
    message: str
