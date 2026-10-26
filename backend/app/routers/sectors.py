from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import add_audit
from ..database import get_db
from ..models import Sector, SectorMembership, Session as DbSession, User, VaultBundle, utcnow
from ..schemas import SectorCreate, SectorMemberCreate, SectorMembershipCreate
from ..security import AuthContext, b64d, b64e, consume_reauth_token, get_auth_context, hash_auth_proof

router = APIRouter(prefix="/sectors", tags=["sectors"])


def _admin(auth: AuthContext):
    if auth.user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")


def _sector_for_member(db: Session, sector_id: UUID, user_id: UUID) -> SectorMembership:
    membership = db.scalar(select(SectorMembership).where(
        SectorMembership.sector_id == sector_id,
        SectorMembership.user_id == user_id,
        SectorMembership.revoked_at.is_(None),
    ))
    if not membership:
        raise HTTPException(status_code=404, detail="Sector not found")
    return membership


@router.get("")
def list_my_sectors(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Sector, SectorMembership).join(SectorMembership, SectorMembership.sector_id == Sector.id)
        .where(SectorMembership.user_id == auth.user.id, SectorMembership.revoked_at.is_(None))
        .order_by(Sector.name)
    ).all()
    return [{
        "id": str(sector.id), "name": sector.name,
        "wrapped_sector_key": b64e(membership.wrapped_sector_key), "key_nonce": b64e(membership.key_nonce),
        "rotation_required": sector.rotation_required,
    } for sector, membership in rows]


@router.get("/users")
def list_users(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    users = db.scalars(select(User).order_by(User.display_name, User.email)).all()
    return [{"id": str(u.id), "display_name": u.display_name, "email": u.email, "role": u.role,
             "is_active": u.is_active, "created_at": u.created_at} for u in users]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: SectorMemberCreate, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    email = str(payload.email).strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already exists")
    user = User(email=email, display_name=payload.display_name.strip(), role="member",
                auth_proof_hash=hash_auth_proof(payload.auth_proof), is_active=True, bootstrap_created=False)
    db.add(user)
    db.flush()
    bundle = payload.vault
    db.add(VaultBundle(user_id=user.id, kdf_salt=b64d(bundle.kdf_salt),
        kdf_memory_kib=bundle.kdf_memory_kib, kdf_iterations=bundle.kdf_iterations,
        kdf_parallelism=bundle.kdf_parallelism, wrapped_metadata_key=b64d(bundle.wrapped_metadata_key),
        metadata_key_nonce=b64d(bundle.metadata_key_nonce), wrapped_search_key=b64d(bundle.wrapped_search_key),
        search_key_nonce=b64d(bundle.search_key_nonce), wrapped_secret_key=b64d(bundle.wrapped_secret_key),
        secret_key_nonce=b64d(bundle.secret_key_nonce), crypto_version=bundle.crypto_version))
    if payload.sector_id is not None:
        if not payload.wrapped_sector_key or not payload.key_nonce:
            raise HTTPException(status_code=422, detail="An encrypted sector key is required for sector membership")
        if not db.get(Sector, payload.sector_id):
            raise HTTPException(status_code=404, detail="Sector not found")
        db.add(SectorMembership(sector_id=payload.sector_id, user_id=user.id,
            wrapped_sector_key=b64d(payload.wrapped_sector_key), key_nonce=b64d(payload.key_nonce)))
    elif payload.wrapped_sector_key is not None or payload.key_nonce is not None:
        raise HTTPException(status_code=422, detail="Sector id is required with a wrapped sector key")
    add_audit(db, auth.user.id, auth.session.id, "USER_CREATED", "user", user.id, sector_id=payload.sector_id)
    db.commit()
    return {"id": str(user.id), "display_name": user.display_name, "email": user.email, "role": user.role, "is_active": user.is_active}


@router.patch("/users/{user_id}/active")
def set_user_active(user_id: UUID, active: bool, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "superadmin" and not active:
        active_admins = db.scalars(select(User.id).where(User.role == "superadmin", User.is_active.is_(True))).all()
        if len(active_admins) <= 1:
            raise HTTPException(status_code=409, detail="Cannot deactivate the last active superadmin")
    user.is_active = active
    if not active:
        for session in db.scalars(select(DbSession).where(DbSession.user_id == user.id, DbSession.revoked_at.is_(None))).all():
            session.revoked_at = utcnow()
        memberships = db.scalars(select(SectorMembership).where(SectorMembership.user_id == user.id, SectorMembership.revoked_at.is_(None))).all()
        for membership in memberships:
            membership.revoked_at = utcnow()
            sector = db.get(Sector, membership.sector_id)
            if sector:
                sector.rotation_required = True
                sector.rotation_marked_at = None
                sector.rotation_marked_by = None
                add_audit(db, auth.user.id, auth.session.id, "SECTOR_SECRET_ROTATION_REQUIRED", "sector", sector.id, sector_id=sector.id)
    add_audit(db, auth.user.id, auth.session.id, "USER_ACTIVATED" if active else "USER_SUSPENDED", "user", user.id)
    db.commit()
    return {"id": str(user.id), "is_active": user.is_active}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_sector(payload: SectorCreate, reauth_token: str | None = Header(default=None, alias="X-Reauth-Token"), auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    if not reauth_token:
        raise HTTPException(status_code=403, detail="Password confirmation required")
    consume_reauth_token(db, auth, reauth_token, "create_sector")
    sector = Sector(name=payload.name.strip())
    db.add(sector)
    db.flush()
    db.add(SectorMembership(sector_id=sector.id, user_id=auth.user.id,
        wrapped_sector_key=b64d(payload.wrapped_sector_key), key_nonce=b64d(payload.key_nonce)))
    add_audit(db, auth.user.id, auth.session.id, "SECTOR_CREATED", "sector", sector.id, sector_id=sector.id)
    db.commit()
    return {"id": str(sector.id), "name": sector.name, "rotation_required": False}


@router.post("/{sector_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(sector_id: UUID, payload: SectorMembershipCreate, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    sector = db.get(Sector, sector_id)
    user = db.get(User, payload.user_id)
    if not sector or not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Sector or active user not found")
    existing = db.scalar(select(SectorMembership).where(SectorMembership.sector_id == sector_id, SectorMembership.user_id == user.id))
    if existing and existing.revoked_at is None:
        raise HTTPException(status_code=409, detail="User is already a sector member")
    if existing:
        existing.wrapped_sector_key = b64d(payload.wrapped_sector_key)
        existing.key_nonce = b64d(payload.key_nonce)
        existing.revoked_at = None
        existing.created_at = utcnow()
    else:
        db.add(SectorMembership(sector_id=sector_id, user_id=user.id,
            wrapped_sector_key=b64d(payload.wrapped_sector_key), key_nonce=b64d(payload.key_nonce)))
    add_audit(db, auth.user.id, auth.session.id, "SECTOR_MEMBER_ADDED", "sector", sector_id, sector_id=sector_id)
    db.commit()
    return {"user_id": str(user.id), "sector_id": str(sector.id)}


@router.delete("/{sector_id}/members/{user_id}", status_code=204)
def remove_member(sector_id: UUID, user_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    membership = db.scalar(select(SectorMembership).where(SectorMembership.sector_id == sector_id,
        SectorMembership.user_id == user_id, SectorMembership.revoked_at.is_(None)))
    sector = db.get(Sector, sector_id)
    if not membership or not sector:
        raise HTTPException(status_code=404, detail="Sector member not found")
    if user_id == auth.user.id:
        raise HTTPException(status_code=409, detail="Superadmin cannot remove itself from a sector")
    membership.revoked_at = utcnow()
    sector.rotation_required = True
    sector.rotation_marked_at = None
    sector.rotation_marked_by = None
    add_audit(db, auth.user.id, auth.session.id, "SECTOR_MEMBER_REMOVED", "sector", sector_id, sector_id=sector_id)
    add_audit(db, auth.user.id, auth.session.id, "SECTOR_SECRET_ROTATION_REQUIRED", "sector", sector_id, sector_id=sector_id)
    db.commit()


@router.post("/{sector_id}/rotation-complete")
def acknowledge_rotation(sector_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _admin(auth)
    sector = db.get(Sector, sector_id)
    if not sector:
        raise HTTPException(status_code=404, detail="Sector not found")
    _sector_for_member(db, sector_id, auth.user.id)
    sector.rotation_required = False
    sector.rotation_marked_at = utcnow()
    sector.rotation_marked_by = auth.user.id
    add_audit(db, auth.user.id, auth.session.id, "SECTOR_SECRETS_ROTATED", "sector", sector_id, sector_id=sector_id)
    db.commit()
    return {"rotation_required": False, "marked_at": sector.rotation_marked_at}


@router.get("/{sector_id}/members")
def list_members(sector_id: UUID, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _sector_for_member(db, sector_id, auth.user.id)
    rows = db.execute(select(User, SectorMembership).join(SectorMembership, SectorMembership.user_id == User.id)
        .where(SectorMembership.sector_id == sector_id, SectorMembership.revoked_at.is_(None)).order_by(User.display_name)).all()
    return [{"id": str(user.id), "display_name": user.display_name, "email": user.email, "role": user.role}
        for user, _membership in rows]
