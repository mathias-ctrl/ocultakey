from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlalchemy import and_, select, text
from sqlalchemy.orm import Session

from .database import get_db
from .models import SectorMembership
from .security import AuthContext, get_auth_context


@dataclass(frozen=True)
class VaultScope:
    user_id: UUID
    sector_id: UUID | None


def get_vault_scope(
    sector_id: UUID | None = Header(default=None, alias="X-Sector-Id"),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> VaultScope:
    if sector_id is not None:
        membership = db.scalar(select(SectorMembership.id).where(
            SectorMembership.sector_id == sector_id,
            SectorMembership.user_id == auth.user.id,
            SectorMembership.revoked_at.is_(None),
        ))
        if not membership:
            raise HTTPException(status_code=403, detail="Active sector membership required")
        db.execute(text("SELECT set_config('app.sector_id', :sector_id, false)"), {"sector_id": str(sector_id)})
        db.commit()
    else:
        db.execute(text("SELECT set_config('app.sector_id', '', false)"))
        db.commit()
    return VaultScope(user_id=auth.user.id, sector_id=sector_id)


def scope_clause(model, scope: VaultScope):
    if scope.sector_id is not None:
        return model.sector_id == scope.sector_id
    return and_(model.user_id == scope.user_id, model.sector_id.is_(None))
