from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import re

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "OcultaKey"
    app_env: str = "production"
    app_secret: str = Field(..., min_length=32)
    public_url: str = "http://localhost:8000"
    port: int = 8000

    database_url: str = "postgresql+psycopg://ocultakey:ocultakey@db:5432/ocultakey"
    database_schema: str = "ocultakey"

    bootstrap_email: str | None = None
    bootstrap_password: str | None = None

    access_token_expire_minutes: int = 10
    refresh_token_expire_days: int = 30
    secret_unlock_minutes: int = 1
    vault_auto_lock_minutes: int = 10

    cors_origins: str = "http://localhost:5173,http://localhost:8000"

    max_login_attempts: int = 5
    login_window_seconds: int = 300

    backup_enabled: bool = True
    backup_interval_hours: int = 24
    backup_retention: int = 7
    backup_path: str = "/data/backups"

    google_drive_enabled: bool = False
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_drive_folder_id: str = "root"

    kdf_memory_kib: int = 65536
    kdf_iterations: int = 3
    kdf_parallelism: int = 1

    @field_validator("database_schema")
    @classmethod
    def validate_database_schema(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
            raise ValueError("DATABASE_SCHEMA must contain only letters, numbers and underscores and cannot start with a number")
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value):
        if isinstance(value, str):
            if value.startswith("postgres://"):
                return "postgresql+psycopg://" + value[len("postgres://"):]
            if value.startswith("postgresql://") and "+psycopg" not in value.split("://", 1)[0]:
                return "postgresql+psycopg://" + value[len("postgresql://"):]
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def backup_dir(self) -> Path:
        path = Path(self.backup_path)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.public_url.rstrip('/')}/api/v1/backup/drive/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
