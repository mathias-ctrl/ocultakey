from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..audit import add_audit
from ..backup import build_snapshot, decode_oky, encode_oky, write_local_backup
from ..config import get_settings
from ..database import get_db
from ..drive import create_drive_auth_url, finish_drive_auth, get_drive_credentials, list_folders, set_folder, upload_backup
from ..models import SearchToken, VaultClient, VaultItem
from ..schemas import DriveFolderSelection
from ..security import AuthContext, consume_reauth_token, get_auth_context

router = APIRouter(prefix="/backup", tags=["backup"])
settings = get_settings()


@router.get("/export.oky")
def export_oky(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    data = encode_oky(build_snapshot(db, auth.user))
    add_audit(db, auth.user.id, auth.session.id, "OKY_EXPORTED", "vault", None)
    db.commit()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Response(
        data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="ocultakey-{stamp}.oky"', "X-OcultaKey-Format": "OKY1"},
    )


@router.get("/snapshot")
def snapshot(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    return build_snapshot(db, auth.user, include_audit=False)


@router.post("/local")
def backup_local(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    path = write_local_backup(db, auth.user, settings.backup_dir)
    add_audit(db, auth.user.id, auth.session.id, "LOCAL_BACKUP_CREATED", "vault", None)
    db.commit()
    return {"file": path.name}


@router.get("/local")
def list_local(auth: AuthContext = Depends(get_auth_context)):
    files = sorted(settings.backup_dir.glob("*.oky"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [{"name": p.name, "size": p.stat().st_size, "modified_at": datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)} for p in files[:100]]


@router.post("/drive/connect")
def drive_connect(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    try:
        url, _ = create_drive_auth_url(db, auth.user.id)
        return {"url": url}
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/drive/callback")
def drive_callback(state: str, code: str, db: Session = Depends(get_db)):
    try:
        finish_drive_auth(db, state, code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Google Drive connection failed: {exc}")
    return RedirectResponse(url="/settings?drive=connected")


@router.get("/drive/status")
def drive_status(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    _, row = get_drive_credentials(db, auth.user.id) if settings.google_drive_enabled else (None, None)
    if not row:
        return {"enabled": settings.google_drive_enabled, "connected": False}
    cfg = json.loads(row.metadata_json or "{}")
    return {"enabled": True, "connected": True, "folder_id": cfg.get("folder_id", "root")}


@router.get("/drive/folders")
def drive_folders(parent_id: str = "root", auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    try:
        return list_folders(db, auth.user.id, parent_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/drive/folder")
def drive_folder(payload: DriveFolderSelection, auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    try:
        set_folder(db, auth.user.id, payload.folder_id)
        return {"folder_id": payload.folder_id}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/drive/now")
def drive_now(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    snapshot = build_snapshot(db, auth.user)
    data = encode_oky(snapshot)
    filename = f"ocultakey-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.oky"
    try:
        result = upload_backup(db, auth.user.id, filename, data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    add_audit(db, auth.user.id, auth.session.id, "DRIVE_BACKUP_CREATED", "vault", None)
    db.commit()
    return result


@router.post("/restore")
async def restore_oky(
    file: UploadFile = File(...),
    reauth_token: str = Header(alias="X-Reauth-Token"),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    consume_reauth_token(db, auth, reauth_token, "restore_backup")
    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Backup file is too large")
    try:
        snapshot = decode_oky(data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    source_vault = snapshot.get("vault", {})
    current_vault = auth.user.vault_bundle
    from ..security import b64e
    if source_vault.get("wrapped_metadata_key") != b64e(current_vault.wrapped_metadata_key):
        raise HTTPException(status_code=400, detail="This .oky backup belongs to a different vault. V1 only restores backups from the same OcultaKey vault.")

    from uuid import UUID
    from datetime import datetime as dt
    from ..security import b64d

    db.execute(delete(SearchToken).where(SearchToken.user_id == auth.user.id))
    db.execute(delete(VaultItem).where(VaultItem.user_id == auth.user.id))
    db.execute(delete(VaultClient).where(VaultClient.user_id == auth.user.id))
    db.flush()

    for c in snapshot.get("clients", []):
        db.add(VaultClient(
            id=UUID(c["id"]), user_id=auth.user.id,
            metadata_ciphertext=b64d(c["metadata_ciphertext"]), metadata_nonce=b64d(c["metadata_nonce"]),
            crypto_version=c.get("crypto_version", 1), favorite=c.get("favorite", False),
            created_at=dt.fromisoformat(c["created_at"]), updated_at=dt.fromisoformat(c["updated_at"]),
            deleted_at=dt.fromisoformat(c["deleted_at"]) if c.get("deleted_at") else None,
        ))
    db.flush()
    for i in snapshot.get("items", []):
        db.add(VaultItem(
            id=UUID(i["id"]), user_id=auth.user.id, client_id=UUID(i["client_id"]),
            metadata_ciphertext=b64d(i["metadata_ciphertext"]), metadata_nonce=b64d(i["metadata_nonce"]),
            secret_ciphertext=b64d(i["secret_ciphertext"]), secret_nonce=b64d(i["secret_nonce"]),
            crypto_version=i.get("crypto_version", 1), favorite=i.get("favorite", False),
            created_at=dt.fromisoformat(i["created_at"]), updated_at=dt.fromisoformat(i["updated_at"]),
            deleted_at=dt.fromisoformat(i["deleted_at"]) if i.get("deleted_at") else None,
        ))
    for t in snapshot.get("search_tokens", []):
        db.add(SearchToken(user_id=auth.user.id, owner_type=t["owner_type"], owner_id=UUID(t["owner_id"]), token=t["token"]))
    add_audit(db, auth.user.id, auth.session.id, "BACKUP_RESTORED", "vault", None)
    db.commit()
    return {"restored": True, "clients": len(snapshot.get("clients", [])), "items": len(snapshot.get("items", []))}
