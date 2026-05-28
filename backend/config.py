from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8000
    model: str | None = None
    system_prompt: str = "You are a helpful assistant. Be concise and clear."
    permission_mode: str = "bypassPermissions"
    session_timeout_minutes: int = 30
    allowed_tools: list[str] = [
        "Bash", "Glob", "Read", "Write", "Edit", "WebFetch", "WebSearch"
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
