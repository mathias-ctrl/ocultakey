from __future__ import annotations

import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEvent, SearchToken, User, VaultClient, VaultItem
from .security import b64e, vault_bundle_payload

MAGIC = b"OKY1\n"
FORMAT_VERSION = 1


def _iso(value):
    return value.isoformat() if value else None


def build_snapshot(db: Session, user: User, include_audit: bool = True) -> dict[str, Any]:
    clients = db.scalars(select(VaultClient).where(VaultClient.user_id == user.id)).all()
    items = db.scalars(select(VaultItem).where(VaultItem.user_id == user.id)).all()
    tokens = db.scalars(select(SearchToken).where(SearchToken.user_id == user.id)).all()
    payload: dict[str, Any] = {
        "format": "OcultaKey",
        "format_version": FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "vault": vault_bundle_payload(user.vault_bundle),
        "clients": [
            {
                "id": str(x.id),
                "metadata_ciphertext": b64e(x.metadata_ciphertext),
                "metadata_nonce": b64e(x.metadata_nonce),
                "crypto_version": x.crypto_version,
                "favorite": x.favorite,
                "created_at": _iso(x.created_at),
                "updated_at": _iso(x.updated_at),
                "deleted_at": _iso(x.deleted_at),
            }
            for x in clients
        ],
        "items": [
            {
                "id": str(x.id),
                "client_id": str(x.client_id),
                "metadata_ciphertext": b64e(x.metadata_ciphertext),
                "metadata_nonce": b64e(x.metadata_nonce),
                "secret_ciphertext": b64e(x.secret_ciphertext),
                "secret_nonce": b64e(x.secret_nonce),
                "crypto_version": x.crypto_version,
                "favorite": x.favorite,
                "created_at": _iso(x.created_at),
                "updated_at": _iso(x.updated_at),
                "deleted_at": _iso(x.deleted_at),
            }
            for x in items
        ],
        "search_tokens": [
            {"owner_type": x.owner_type, "owner_id": str(x.owner_id), "token": x.token}
            for x in tokens
        ],
    }
    if include_audit:
        audits = db.scalars(select(AuditEvent).where(AuditEvent.user_id == user.id)).all()
        payload["audit"] = [
            {
                "event": x.event,
                "object_type": x.object_type,
                "object_id": str(x.object_id) if x.object_id else None,
                "created_at": _iso(x.created_at),
            }
            for x in audits
        ]
    return payload


def encode_oky(snapshot: dict[str, Any]) -> bytes:
    raw = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    checksum = hashlib.sha256(raw).hexdigest().encode("ascii")
    envelope = json.dumps(
        {
            "checksum": checksum.decode("ascii"),
            "compression": "gzip",
            "payload": b64e(gzip.compress(raw, compresslevel=6)),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return MAGIC + envelope


def decode_oky(data: bytes) -> dict[str, Any]:
    if not data.startswith(MAGIC):
        raise ValueError("Invalid .oky header")
    envelope = json.loads(data[len(MAGIC):].decode("utf-8"))
    import base64
    compressed = base64.urlsafe_b64decode(envelope["payload"].encode("ascii"))
    raw = gzip.decompress(compressed)
    if hashlib.sha256(raw).hexdigest() != envelope["checksum"]:
        raise ValueError("Backup checksum mismatch")
    snapshot = json.loads(raw.decode("utf-8"))
    if snapshot.get("format") != "OcultaKey" or snapshot.get("format_version") != FORMAT_VERSION:
        raise ValueError("Unsupported .oky format")
    return snapshot


def write_local_backup(db: Session, user: User, directory: Path) -> Path:
    snapshot = build_snapshot(db, user)
    data = encode_oky(snapshot)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = directory / f"ocultakey-{stamp}.oky"
    path.write_bytes(data)
    return path
