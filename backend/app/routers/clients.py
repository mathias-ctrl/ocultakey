from __future__ import annotations

import json
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from ..audit import add_audit
from ..database import get_db
from ..models import IdempotencyRecord, SearchToken, VaultClient, VaultItem, utcnow
from ..schemas import CipherBlob, ClientCreate, ClientOut, ClientPage, ClientUpdate
from ..security import AuthContext, b64d, b64e, consume_reauth_token, get_auth_context
from ..utils import decode_cursor, encode_cursor

router = APIRouter(prefix="/clients", tags=["clients"])


def _out(row: VaultClient) -> ClientOut:
    return ClientOut(
        id=row.id,
        metadata=CipherBlob(ciphertext=b64e(row.metadata_ciphertext), nonce=b64e(row.metadata_nonce), crypto_version=row.crypto_version),
        favorite=row.favorite,
        created_at=row.created_at,
        updated_at=row.updated_at,
        deleted_at=row.deleted_at,
    )


def _existing_idempotent(db: Session, user_id: UUID, key: str | None, method: str, path: str):
    if not key:
        return None
    return db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.key == key,
            IdempotencyRecord.method == method,
            IdempotencyRecord.path == path,
            IdempotencyRecord.expires_at > utcnow(),
        )
    )


def _store_idempotent(db: Session, user_id: UUID, key: str | None, method: str, path: str, status_code: int, data: dict):
    if not key:
        return
    db.add(
        IdempotencyRecord(
            user_id=user_id,
            key=key,
            method=method,
            path=path,
            status_code=status_code,
            response_json=json.dumps(data, default=str),
            expires_at=utcnow() + timedelta(hours=24),
        )
    )


@router.get("", response_model=ClientPage)
def list_clients(
    limit: int = 50,
    cursor: str | None = None,
    deleted: bool = False,
    favorite: bool | None = None,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    query = select(VaultClient).where(VaultClient.user_id == auth.user.id)
    query = query.where(VaultClient.deleted_at.is_not(None) if deleted else VaultClient.deleted_at.is_(None))
    if favorite is not None:
        query = query.where(VaultClient.favorite == favorite)
    if cursor:
        updated_at, row_id = decode_cursor(cursor)
        query = query.where(or_(VaultClient.updated_at < updated_at, and_(VaultClient.updated_at == updated_at, VaultClient.id < row_id)))
    rows = db.scalars(query.order_by(VaultClient.updated_at.desc(), VaultClient.id.desc()).limit(limit + 1)).all()
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_cursor(last.updated_at, last.id)
        rows = rows[:limit]
    return ClientPage(items=[_out(row) for row in rows], next_cursor=next_cursor)


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultClient).where(VaultClient.id == client_id, VaultClient.user_id == auth.user.id))
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return _out(row)


@router.post("", response_model=ClientOut, status_code=201)
def create_client(
    payload: ClientCreate,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    previous = _existing_idempotent(db, auth.user.id, idempotency_key, "POST", request.url.path)
    if previous:
        return JSONResponse(status_code=previous.status_code, content=json.loads(previous.response_json))
    row = VaultClient(
        user_id=auth.user.id,
        metadata_ciphertext=b64d(payload.metadata.ciphertext),
        metadata_nonce=b64d(payload.metadata.nonce),
        crypto_version=payload.metadata.crypto_version,
        favorite=payload.favorite,
    )
    db.add(row)
    db.flush()
    db.add_all(SearchToken(user_id=auth.user.id, owner_type="client", owner_id=row.id, token=t) for t in set(payload.search_tokens))
    add_audit(db, auth.user.id, auth.session.id, "CLIENT_CREATED", "client", row.id)
    result = _out(row).model_dump(mode="json")
    _store_idempotent(db, auth.user.id, idempotency_key, "POST", request.url.path, 201, result)
    db.commit()
    return row and _out(row)


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: UUID, payload: ClientUpdate, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultClient).where(VaultClient.id == client_id, VaultClient.user_id == auth.user.id))
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    row.metadata_ciphertext = b64d(payload.metadata.ciphertext)
    row.metadata_nonce = b64d(payload.metadata.nonce)
    row.crypto_version = payload.metadata.crypto_version
    row.favorite = payload.favorite
    db.execute(delete(SearchToken).where(SearchToken.user_id == auth.user.id, SearchToken.owner_type == "client", SearchToken.owner_id == row.id))
    db.add_all(SearchToken(user_id=auth.user.id, owner_type="client", owner_id=row.id, token=t) for t in set(payload.search_tokens))
    add_audit(db, auth.user.id, auth.session.id, "CLIENT_UPDATED", "client", row.id)
    db.commit()
    return _out(row)


@router.delete("/{client_id}", status_code=204)
def trash_client(
    client_id: UUID,
    reauth_token: str | None = Header(default=None, alias="X-Reauth-Token"),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if not reauth_token:
        raise HTTPException(status_code=403, detail="Password confirmation required")
    consume_reauth_token(db, auth, reauth_token, f"delete_client:{client_id}")
    row = db.scalar(select(VaultClient).where(VaultClient.id == client_id, VaultClient.user_id == auth.user.id, VaultClient.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    now = utcnow()
    row.deleted_at = now
    for item in db.scalars(select(VaultItem).where(VaultItem.user_id == auth.user.id, VaultItem.client_id == row.id, VaultItem.deleted_at.is_(None))).all():
        item.deleted_at = now
    add_audit(db, auth.user.id, auth.session.id, "CLIENT_TRASHED", "client", row.id)
    db.commit()


@router.post("/{client_id}/restore", response_model=ClientOut)
def restore_client(client_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultClient).where(VaultClient.id == client_id, VaultClient.user_id == auth.user.id, VaultClient.deleted_at.is_not(None)))
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    row.deleted_at = None
    add_audit(db, auth.user.id, auth.session.id, "CLIENT_RESTORED", "client", row.id)
    db.commit()
    return _out(row)


@router.delete("/{client_id}/permanent", status_code=204)
def delete_client_permanent(
    client_id: UUID,
    reauth_token: str | None = Header(default=None, alias="X-Reauth-Token"),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if not reauth_token:
        raise HTTPException(status_code=403, detail="Password confirmation required")
    consume_reauth_token(db, auth, reauth_token, f"delete_client_permanent:{client_id}")
    row = db.scalar(select(VaultClient).where(VaultClient.id == client_id, VaultClient.user_id == auth.user.id, VaultClient.deleted_at.is_not(None)))
    if not row:
        raise HTTPException(status_code=404, detail="Client not found in trash")
    db.execute(delete(SearchToken).where(SearchToken.user_id == auth.user.id, SearchToken.owner_id == client_id))
    db.delete(row)
    add_audit(db, auth.user.id, auth.session.id, "CLIENT_DELETED", "client", client_id)
    db.commit()
