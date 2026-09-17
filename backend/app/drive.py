from __future__ import annotations

import io
import json
import secrets
from datetime import timedelta

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import IntegrationSecret, OAuthState, utcnow
from .security import app_fernet, hash_token

settings = get_settings()
SCOPES = ["https://www.googleapis.com/auth/drive"]


def _client_config():
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


def create_drive_auth_url(db: Session, user_id):
    if not settings.google_drive_enabled or not settings.google_client_id or not settings.google_client_secret:
        raise RuntimeError("Google Drive is not configured")
    state = secrets.token_urlsafe(32)
    db.add(OAuthState(user_id=user_id, state_hash=hash_token(state), expires_at=utcnow() + timedelta(minutes=10)))
    db.commit()
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=settings.google_redirect_uri, state=state)
    url, _ = flow.authorization_url(access_type="offline", include_granted_scopes="true", prompt="consent")
    return url, state


def finish_drive_auth(db: Session, state: str, code: str):
    row = db.scalar(select(OAuthState).where(OAuthState.state_hash == hash_token(state)))
    if not row or row.used_at is not None or row.expires_at <= utcnow():
        raise ValueError("Invalid OAuth state")
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=settings.google_redirect_uri, state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        raise ValueError("Google did not return a refresh token")
    existing = db.scalar(select(IntegrationSecret).where(IntegrationSecret.user_id == row.user_id, IntegrationSecret.provider == "google_drive"))
    encrypted = app_fernet().encrypt(creds.refresh_token.encode("utf-8"))
    metadata = json.dumps({"folder_id": settings.google_drive_folder_id})
    if existing:
        existing.encrypted_value = encrypted
        existing.metadata_json = metadata
    else:
        db.add(IntegrationSecret(user_id=row.user_id, provider="google_drive", encrypted_value=encrypted, metadata_json=metadata))
    row.used_at = utcnow()
    db.commit()
    return row.user_id


def get_drive_credentials(db: Session, user_id):
    row = db.scalar(select(IntegrationSecret).where(IntegrationSecret.user_id == user_id, IntegrationSecret.provider == "google_drive"))
    if not row:
        return None, None
    refresh_token = app_fernet().decrypt(row.encrypted_value).decode("utf-8")
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
    )
    creds.refresh(GoogleRequest())
    return creds, row


def list_folders(db: Session, user_id, parent_id: str = "root"):
    creds, _ = get_drive_credentials(db, user_id)
    if not creds:
        raise RuntimeError("Google Drive is not connected")
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    query = f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    result = service.files().list(q=query, fields="files(id,name)", orderBy="name", pageSize=100).execute()
    return result.get("files", [])


def set_folder(db: Session, user_id, folder_id: str):
    _, row = get_drive_credentials(db, user_id)
    if not row:
        raise RuntimeError("Google Drive is not connected")
    metadata = json.loads(row.metadata_json or "{}")
    metadata["folder_id"] = folder_id
    row.metadata_json = json.dumps(metadata)
    db.commit()


def upload_backup(db: Session, user_id, filename: str, data: bytes):
    creds, row = get_drive_credentials(db, user_id)
    if not creds or not row:
        raise RuntimeError("Google Drive is not connected")
    metadata_cfg = json.loads(row.metadata_json or "{}")
    folder_id = metadata_cfg.get("folder_id", "root")
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/octet-stream", resumable=False)
    body = {"name": filename, "parents": [folder_id]}
    result = service.files().create(body=body, media_body=media, fields="id,name,webViewLink").execute()
    return result
