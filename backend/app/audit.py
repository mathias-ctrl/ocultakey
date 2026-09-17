from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from .models import AuditEvent


def add_audit(db: Session, user_id: UUID, session_id: UUID | None, event: str, object_type: str | None = None, object_id: UUID | None = None) -> None:
    db.add(
        AuditEvent(
            user_id=user_id,
            session_id=session_id,
            event=event,
            object_type=object_type,
            object_id=object_id,
        )
    )
