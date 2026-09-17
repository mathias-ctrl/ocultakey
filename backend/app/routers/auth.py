from __future__ import annotations

import secrets
from collections import defaultdict, deque
from datetime import timedelta
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import add_audit
from ..config import get_settings
from ..database import get_db
from ..models import Session as DbSession, User, utcnow
from ..schemas import LoginRequest, LoginResponse, ReauthRequest
from ..security import (
    AuthContext,
    create_access_token,
    get_auth_context,
    hash_ip,
    hash_token,
    new_reauth_token,
    new_refresh_token,
    vault_bundle_payload,
    verify_auth_proof,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempts_lock = Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit_login(ip: str) -> None:
    now = monotonic()
    with _attempts_lock:
        queue = _attempts[ip]
        cutoff = now - settings.login_window_seconds
        while queue and queue[0] < cutoff:
            queue.popleft()
        if len(queue) >= settings.max_login_attempts:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
        queue.append(now)


def _clear_attempts(ip: str) -> None:
    with _attempts_lock:
        _attempts.pop(ip, None)


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="oky_refresh",
        value=token,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.app_env != "development",
        samesite="strict",
        path="/api/v1/auth",
    )


@router.get("/prelogin")
def prelogin(email: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if not user or not user.is_active or not user.vault_bundle:
        return {"kdf_salt": "AAAAAAAAAAAAAAAAAAAAAA==", "kdf_memory_kib": settings.kdf_memory_kib, "kdf_iterations": settings.kdf_iterations, "kdf_parallelism": settings.kdf_parallelism}
    bundle = user.vault_bundle
    from ..security import b64e
    return {"kdf_salt": b64e(bundle.kdf_salt), "kdf_memory_kib": bundle.kdf_memory_kib, "kdf_iterations": bundle.kdf_iterations, "kdf_parallelism": bundle.kdf_parallelism}


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    _rate_limit_login(ip)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active or not verify_auth_proof(user.auth_proof_hash, payload.auth_proof):
        if user:
            add_audit(db, user.id, None, "LOGIN_FAILED")
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    _clear_attempts(ip)
    refresh = new_refresh_token()
    session = DbSession(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh),
        device_name=payload.device_name,
        user_agent=request.headers.get("user-agent"),
        ip_hash=hash_ip(ip),
        expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)
    db.flush()
    add_audit(db, user.id, session.id, "LOGIN")
    db.commit()

    access, expires = create_access_token(user.id, session.id)
    _set_refresh_cookie(response, refresh)
    return LoginResponse(access_token=access, expires_in=expires, vault=vault_bundle_payload(user.vault_bundle))


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get("oky_refresh")
    if not raw:
        raise HTTPException(status_code=401, detail="Refresh session not found")
    session = db.scalar(select(DbSession).where(DbSession.refresh_token_hash == hash_token(raw)))
    if not session or session.revoked_at is not None or session.expires_at <= utcnow():
        response.delete_cookie("oky_refresh", path="/api/v1/auth")
        raise HTTPException(status_code=401, detail="Refresh session expired")

    new_raw = new_refresh_token()
    session.refresh_token_hash = hash_token(new_raw)
    session.last_seen_at = utcnow()
    db.commit()
    access, expires = create_access_token(session.user_id, session.id)
    _set_refresh_cookie(response, new_raw)
    return {"access_token": access, "token_type": "bearer", "expires_in": expires}


@router.post("/logout", status_code=204)
def logout(response: Response, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    auth.session.revoked_at = utcnow()
    add_audit(db, auth.user.id, auth.session.id, "LOGOUT")
    db.commit()
    response.delete_cookie("oky_refresh", path="/api/v1/auth")


@router.get("/me")
def me(auth: AuthContext = Depends(get_auth_context)):
    return {
        "id": str(auth.user.id),
        "email": auth.user.email,
        "vault": vault_bundle_payload(auth.user.vault_bundle),
        "secret_unlock_minutes": settings.secret_unlock_minutes,
        "vault_auto_lock_minutes": settings.vault_auto_lock_minutes,
    }


@router.post("/reauth")
def reauth(payload: ReauthRequest, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    if not verify_auth_proof(auth.user.auth_proof_hash, payload.auth_proof):
        raise HTTPException(status_code=403, detail="Password confirmation failed")
    token = new_reauth_token(db, auth, payload.purpose)
    add_audit(db, auth.user.id, auth.session.id, "REAUTH", "session", auth.session.id)
    db.commit()
    return {"token": token, "expires_in": settings.secret_unlock_minutes * 60, "single_use": True}


@router.get("/sessions")
def sessions(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(DbSession).where(DbSession.user_id == auth.user.id).order_by(DbSession.created_at.desc())
    ).all()
    return [
        {
            "id": str(row.id),
            "device_name": row.device_name,
            "created_at": row.created_at,
            "last_seen_at": row.last_seen_at,
            "expires_at": row.expires_at,
            "revoked_at": row.revoked_at,
            "current": row.id == auth.session.id,
        }
        for row in rows
    ]
