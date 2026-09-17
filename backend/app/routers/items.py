from __future__ import annotations

from uuid import UUID
import json
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from ..audit import add_audit
from ..database import get_db
from ..models import IdempotencyRecord, SearchToken, VaultClient, VaultItem, utcnow
from ..schemas import CipherBlob, ItemCreate, ItemOut, ItemPage, ItemUpdate
from ..security import AuthContext, b64d, b64e, get_auth_context
from ..utils import decode_cursor, encode_cursor

router = APIRouter(prefix="/items", tags=["items"])

def _touch_client(db: Session, user_id: UUID, client_id: UUID):
    parent = db.scalar(select(VaultClient).where(VaultClient.id == client_id, VaultClient.user_id == user_id))
    if parent:
        parent.updated_at = utcnow()


def _existing_idempotent(db: Session, user_id: UUID, key: str | None, method: str, path: str):
    if not key:
        return None
    return db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.user_id == user_id, IdempotencyRecord.key == key, IdempotencyRecord.method == method, IdempotencyRecord.path == path, IdempotencyRecord.expires_at > utcnow()))


def _store_idempotent(db: Session, user_id: UUID, key: str | None, method: str, path: str, status_code: int, data: dict):
    if key:
        db.add(IdempotencyRecord(user_id=user_id, key=key, method=method, path=path, status_code=status_code, response_json=json.dumps(data, default=str), expires_at=utcnow() + timedelta(hours=24)))


def _out(row: VaultItem) -> ItemOut:
    return ItemOut(
        id=row.id,
        client_id=row.client_id,
        metadata=CipherBlob(ciphertext=b64e(row.metadata_ciphertext), nonce=b64e(row.metadata_nonce), crypto_version=row.crypto_version),
        secret=CipherBlob(ciphertext=b64e(row.secret_ciphertext), nonce=b64e(row.secret_nonce), crypto_version=row.crypto_version),
        favorite=row.favorite,
        created_at=row.created_at,
        updated_at=row.updated_at,
        deleted_at=row.deleted_at,
    )


@router.get("", response_model=ItemPage)
def list_items(
    client_id: UUID | None = None,
    limit: int = 50,
    cursor: str | None = None,
    deleted: bool = False,
    favorite: bool | None = None,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    query = select(VaultItem).where(VaultItem.user_id == auth.user.id)
    query = query.where(VaultItem.deleted_at.is_not(None) if deleted else VaultItem.deleted_at.is_(None))
    if client_id:
        query = query.where(VaultItem.client_id == client_id)
    if favorite is not None:
        query = query.where(VaultItem.favorite == favorite)
    if cursor:
        created_at, row_id = decode_cursor(cursor)
        query = query.where(or_(VaultItem.created_at < created_at, and_(VaultItem.created_at == created_at, VaultItem.id < row_id)))
    rows = db.scalars(query.order_by(VaultItem.created_at.desc(), VaultItem.id.desc()).limit(limit + 1)).all()
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_cursor(last.created_at, last.id)
        rows = rows[:limit]
    return ItemPage(items=[_out(row) for row in rows], next_cursor=next_cursor)


@router.post("", response_model=ItemOut, status_code=201)
def create_item(payload: ItemCreate, request: Request, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    previous = _existing_idempotent(db, auth.user.id, idempotency_key, "POST", request.url.path)
    if previous:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=previous.status_code, content=json.loads(previous.response_json))
    parent = db.scalar(select(VaultClient).where(VaultClient.id == payload.client_id, VaultClient.user_id == auth.user.id, VaultClient.deleted_at.is_(None)))
    if not parent:
        raise HTTPException(status_code=404, detail="Client not found")
    row = VaultItem(
        user_id=auth.user.id,
        client_id=payload.client_id,
        metadata_ciphertext=b64d(payload.metadata.ciphertext),
        metadata_nonce=b64d(payload.metadata.nonce),
        secret_ciphertext=b64d(payload.secret.ciphertext),
        secret_nonce=b64d(payload.secret.nonce),
        crypto_version=payload.metadata.crypto_version,
        favorite=payload.favorite,
    )
    db.add(row)
    db.flush()
    db.add_all(SearchToken(user_id=auth.user.id, owner_type="item", owner_id=row.id, token=t) for t in set(payload.search_tokens))
    _touch_client(db, auth.user.id, row.client_id)
    add_audit(db, auth.user.id, auth.session.id, "ITEM_CREATED", "item", row.id)
    result = _out(row).model_dump(mode="json")
    _store_idempotent(db, auth.user.id, idempotency_key, "POST", request.url.path, 201, result)
    db.commit()
    return _out(row)


@router.put("/{item_id}", response_model=ItemOut)
def update_item(item_id: UUID, payload: ItemUpdate, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultItem).where(VaultItem.id == item_id, VaultItem.user_id == auth.user.id))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    row.metadata_ciphertext = b64d(payload.metadata.ciphertext)
    row.metadata_nonce = b64d(payload.metadata.nonce)
    row.secret_ciphertext = b64d(payload.secret.ciphertext)
    row.secret_nonce = b64d(payload.secret.nonce)
    row.crypto_version = payload.metadata.crypto_version
    row.favorite = payload.favorite
    db.execute(delete(SearchToken).where(SearchToken.user_id == auth.user.id, SearchToken.owner_type == "item", SearchToken.owner_id == row.id))
    db.add_all(SearchToken(user_id=auth.user.id, owner_type="item", owner_id=row.id, token=t) for t in set(payload.search_tokens))
    _touch_client(db, auth.user.id, row.client_id)
    add_audit(db, auth.user.id, auth.session.id, "ITEM_UPDATED", "item", row.id)
    db.commit()
    return _out(row)


@router.delete("/{item_id}", status_code=204)
def trash_item(item_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultItem).where(VaultItem.id == item_id, VaultItem.user_id == auth.user.id, VaultItem.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    row.deleted_at = utcnow()
    _touch_client(db, auth.user.id, row.client_id)
    add_audit(db, auth.user.id, auth.session.id, "ITEM_TRASHED", "item", row.id)
    db.commit()


@router.post("/{item_id}/restore", response_model=ItemOut)
def restore_item(item_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultItem).where(VaultItem.id == item_id, VaultItem.user_id == auth.user.id, VaultItem.deleted_at.is_not(None)))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    row.deleted_at = None
    _touch_client(db, auth.user.id, row.client_id)
    add_audit(db, auth.user.id, auth.session.id, "ITEM_RESTORED", "item", row.id)
    db.commit()
    return _out(row)


@router.patch("/{item_id}/favorite", response_model=ItemOut)
def set_favorite(item_id: UUID, favorite: bool, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    row = db.scalar(select(VaultItem).where(VaultItem.id == item_id, VaultItem.user_id == auth.user.id, VaultItem.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    row.favorite = favorite
    _touch_client(db, auth.user.id, row.client_id)
    add_audit(db, auth.user.id, auth.session.id, "ITEM_UPDATED", "item", row.id)
    db.commit()
    return _out(row)
