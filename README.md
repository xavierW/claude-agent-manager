# Claude Agent Manager

Web-based chat application using the [Claude Agent SDK](https://pypi.org/project/claude-agent-sdk/) for Python, providing real-time conversational AI interaction with streaming responses.

## Architecture

```
Browser (SPA)  ←→  WebSocket  ←→  FastAPI Backend  ←→  ClaudeSDKClient
```

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | Vanilla HTML/CSS/JS | Chat UI, session management, streaming markdown rendering |
| Transport | WebSocket (JSON-framed) | Bidirectional real-time communication |
| Backend | FastAPI + Python | WebSocket handler, session lifecycle management |
| AI | `claude-agent-sdk` (`ClaudeSDKClient`) | Stateful multi-turn conversations with Claude |

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app entry, WebSocket endpoint, static serving
│   ├── config.py             # pydantic-settings configuration
│   ├── models.py             # WebSocket message protocol (Pydantic)
│   ├── session_manager.py    # Session lifecycle, ClaudeSDKClient streaming
│   └── ws_handler.py         # WebSocket message dispatch router
├── frontend/static/
│   ├── index.html            # SPA shell
│   ├── css/style.css         # Styles with dark mode support
│   └── js/
│       ├── app.js            # Root controller, state management, EventBus
│       ├── ws.js             # WebSocket client with auto-reconnect
│       ├── chat-ui.js        # Chat rendering & streaming text display
│       ├── session-panel.js  # Sidebar session list
│       └── markdown.js       # Streaming-safe Markdown → HTML renderer
```

## Data Flow

```
User types prompt
  → ChatUI.submitPrompt()
    → EventBus.emit('send-prompt')
      → App.sendQuery()
        → WSClient.send({type: "query", session_id, prompt})
          → WebSocket JSON to backend
            → ws_handler._handle_query()
              → session.send_query(prompt)          # acquires per-session lock
                → ClaudeSDKClient.query(prompt)
                  → async for msg in receive_response():
                    → classify message type
                      → ws.send_json(block)          # streaming blocks
                        → Frontend WSClient.onmessage
                          → dispatch by block type:
                            text     → ChatUI.appendText()       # streaming markdown
                            thinking → ChatUI.addThinkingBlock() # collapsible
                            tool_use → ChatUI.addToolUseBlock()  # tool display
                            done     → ChatUI.finishMessage()    # finalize
```

## WebSocket Protocol

**Client → Server:** `create_session` | `delete_session` | `list_sessions` | `get_history` | `query` | `interrupt`

**Server → Client:** `session_created` | `session_deleted` | `sessions` | `session_history` | `text` | `thinking` | `tool_use` | `tool_result` | `assistant` | `result` | `done` | `error`

## Features

- **Multi-session management** — create, switch, and delete independent chat sessions
- **Real-time streaming** — character-by-character text display via `include_partial_messages`
- **Thinking blocks** — collapsible `<details>` elements for Claude's reasoning
- **Tool use visualization** — inline display of tool calls and results
- **Dark mode** — automatic `prefers-color-scheme` detection
- **Auto-reconnect** — WebSocket reconnection with exponential backoff
- **Session cleanup** — idle sessions auto-expire (configurable timeout)

## Setup

```bash
# 1. Clone
git clone https://github.com/xavierW/claude-agent-manager.git
cd claude-agent-manager

# 2. Create virtual environment & install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Run (SDK auto-detects local Claude Code auth)
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 4. Open browser
open http://127.0.0.1:8000
```

No API key configuration needed — the SDK automatically uses your local Claude Code authentication.

Optionally, copy `.env.example` to `.env` to customize host, port, system prompt, or permission mode.
