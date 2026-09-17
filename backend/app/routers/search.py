from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from ..database import get_db
from ..models import SearchToken, VaultClient, VaultItem
from ..schemas import SearchRequest, SearchResponse
from ..security import AuthContext, get_auth_context
from .clients import _out as client_out
from .items import _out as item_out

router = APIRouter(prefix="/search", tags=["search"])


def _matching_ids(db: Session, user_id, tokens: list[str], owner_type: str, limit: int):
    token_set = list(dict.fromkeys(tokens))
    if not token_set:
        return []
    return db.scalars(
        select(SearchToken.owner_id)
        .where(
            SearchToken.user_id == user_id,
            SearchToken.owner_type == owner_type,
            SearchToken.token.in_(token_set),
        )
        .group_by(SearchToken.owner_id)
        .having(func.count(func.distinct(SearchToken.token)) >= len(token_set))
        .limit(limit)
    ).all()


@router.post("", response_model=SearchResponse)
def search(payload: SearchRequest, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    clients = []
    items = []
    if payload.scope in ("all", "clients"):
        ids = _matching_ids(db, auth.user.id, payload.tokens, "client", payload.limit)
        if ids:
            clients = db.scalars(
                select(VaultClient).where(VaultClient.user_id == auth.user.id, VaultClient.id.in_(ids), VaultClient.deleted_at.is_(None)).order_by(VaultClient.updated_at.desc())
            ).all()
    if payload.scope in ("all", "items"):
        ids = _matching_ids(db, auth.user.id, payload.tokens, "item", payload.limit)
        if ids:
            q = select(VaultItem).where(VaultItem.user_id == auth.user.id, VaultItem.id.in_(ids), VaultItem.deleted_at.is_(None)).order_by(VaultItem.updated_at.desc())
            if payload.client_id:
                q = q.where(VaultItem.client_id == payload.client_id)
            items = db.scalars(q).all()
    return SearchResponse(clients=[client_out(x) for x in clients], items=[item_out(x) for x in items])
