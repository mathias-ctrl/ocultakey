from __future__ import annotations

import base64
import json
from datetime import datetime
from uuid import UUID


def encode_cursor(created_at: datetime, row_id: UUID) -> str:
    raw = json.dumps({"created_at": created_at.isoformat(), "id": str(row_id)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(value: str) -> tuple[datetime, UUID]:
    padded = value + "=" * (-len(value) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
    return datetime.fromisoformat(payload["created_at"]), UUID(payload["id"])
