from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from argon2.low_level import Type, hash_secret_raw
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import ReauthTicket, Session as DbSession, User, VaultBundle, utcnow

settings = get_settings()
password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, hash_len=32, salt_len=16)
bearer = HTTPBearer(auto_error=False)


def b64e(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value.encode("ascii"))


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_ip(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256((settings.app_secret + value).encode("utf-8")).hexdigest()


def derive_auth_proof(kek: bytes) -> bytes:
    return hmac.new(kek, b"ocultakey-auth-v1", hashlib.sha256).digest()


def hash_auth_proof(proof_b64: str) -> str:
    return password_hasher.hash(proof_b64)


def verify_auth_proof(proof_hash: str, proof_b64: str) -> bool:
    try:
        return password_hasher.verify(proof_hash, proof_b64)
    except VerifyMismatchError:
        return False


def derive_kek(password: str, salt: bytes, memory_kib: int, iterations: int, parallelism: int) -> bytes:
    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=iterations,
        memory_cost=memory_kib,
        parallelism=parallelism,
        hash_len=32,
        type=Type.ID,
    )


def wrap_key(kek: bytes, key: bytes) -> tuple[bytes, bytes]:
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(kek).encrypt(nonce, key, b"ocultakey-key-v1")
    return ciphertext, nonce


def build_vault_bundle(user_id: UUID, password: str) -> VaultBundle:
    salt = secrets.token_bytes(16)
    kek = derive_kek(password, salt, settings.kdf_memory_kib, settings.kdf_iterations, settings.kdf_parallelism)
    metadata_key = secrets.token_bytes(32)
    search_key = secrets.token_bytes(32)
    secret_key = secrets.token_bytes(32)

    wrapped_metadata, metadata_nonce = wrap_key(kek, metadata_key)
    wrapped_search, search_nonce = wrap_key(kek, search_key)
    wrapped_secret, secret_nonce = wrap_key(kek, secret_key)

    return VaultBundle(
        user_id=user_id,
        kdf_salt=salt,
        kdf_memory_kib=settings.kdf_memory_kib,
        kdf_iterations=settings.kdf_iterations,
        kdf_parallelism=settings.kdf_parallelism,
        wrapped_metadata_key=wrapped_metadata,
        metadata_key_nonce=metadata_nonce,
        wrapped_search_key=wrapped_search,
        search_key_nonce=search_nonce,
        wrapped_secret_key=wrapped_secret,
        secret_key_nonce=secret_nonce,
        crypto_version=1,
    )


def vault_bundle_payload(bundle: VaultBundle) -> dict[str, Any]:
    return {
        "kdf_salt": b64e(bundle.kdf_salt),
        "kdf_memory_kib": bundle.kdf_memory_kib,
        "kdf_iterations": bundle.kdf_iterations,
        "kdf_parallelism": bundle.kdf_parallelism,
        "wrapped_metadata_key": b64e(bundle.wrapped_metadata_key),
        "metadata_key_nonce": b64e(bundle.metadata_key_nonce),
        "wrapped_search_key": b64e(bundle.wrapped_search_key),
        "search_key_nonce": b64e(bundle.search_key_nonce),
        "wrapped_secret_key": b64e(bundle.wrapped_secret_key),
        "secret_key_nonce": b64e(bundle.secret_key_nonce),
        "crypto_version": bundle.crypto_version,
    }


def create_access_token(user_id: UUID, session_id: UUID) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, settings.app_secret, algorithm="HS256"), int((expires - now).total_seconds())


@dataclass
class AuthContext:
    user: User
    session: DbSession


async def get_auth_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.app_secret, algorithms=["HS256"])
        if payload.get("typ") != "access":
            raise JWTError("wrong token type")
        user_id = UUID(payload["sub"])
        session_id = UUID(payload["sid"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")

    user = db.get(User, user_id)
    session = db.get(DbSession, session_id)
    if not user or not user.is_active or not session or session.user_id != user.id or session.revoked_at is not None or session.expires_at <= utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    session.last_seen_at = utcnow()
    db.commit()
    return AuthContext(user=user, session=session)


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def app_fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.app_secret.encode("utf-8")).digest())
    return Fernet(key)


def new_reauth_token(db: Session, auth: AuthContext, purpose: str) -> str:
    raw = secrets.token_urlsafe(32)
    ticket = ReauthTicket(
        user_id=auth.user.id,
        session_id=auth.session.id,
        token_hash=hash_token(raw),
        purpose=purpose,
        expires_at=utcnow() + timedelta(minutes=settings.secret_unlock_minutes),
    )
    db.add(ticket)
    db.commit()
    return raw


def consume_reauth_token(db: Session, auth: AuthContext, raw: str, purpose: str) -> None:
    token_hash = hash_token(raw)
    ticket = db.scalar(select(ReauthTicket).where(ReauthTicket.token_hash == token_hash))
    if (
        not ticket
        or ticket.user_id != auth.user.id
        or ticket.session_id != auth.session.id
        or ticket.purpose != purpose
        or ticket.used_at is not None
        or ticket.expires_at <= utcnow()
    ):
        raise HTTPException(status_code=403, detail="Invalid or expired one-time authorization")
    ticket.used_at = utcnow()
    db.commit()
