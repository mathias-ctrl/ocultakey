from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .backup import write_local_backup
from .bootstrap import bootstrap_admin
from .drive import upload_backup
from .config import get_settings
from .database import db_session
from .models import User
from .routers import audit, auth, backup, clients, health, items, search

settings = get_settings()
logger = logging.getLogger("ocultakey")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
scheduler = BackgroundScheduler(timezone="UTC")


def scheduled_backup():
    if not settings.backup_enabled:
        return
    with db_session() as db:
        user = db.scalar(select(User).limit(1))
        if not user:
            return
        path = write_local_backup(db, user, settings.backup_dir)
        files = sorted(settings.backup_dir.glob("*.oky"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in files[settings.backup_retention:]:
            old.unlink(missing_ok=True)
        logger.info("Encrypted OcultaKey backup created: %s", path.name)
        if settings.google_drive_enabled:
            try:
                upload_backup(db, user.id, path.name, path.read_bytes())
                logger.info("Encrypted OcultaKey backup uploaded to Google Drive: %s", path.name)
            except Exception as exc:
                logger.warning("Google Drive backup skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_admin()
    if settings.backup_enabled:
        scheduler.add_job(scheduled_backup, "interval", hours=max(1, settings.backup_interval_hours), id="local_backup", replace_existing=True)
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title="OcultaKey API", version="0.2.0", docs_url=None if settings.app_env == "production" else "/api/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Reauth-Token"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method not in {"GET", "POST", "PUT", "DELETE", "OPTIONS"}:
        return JSONResponse(status_code=405, content={"detail": "Method not allowed"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


api_prefix = "/api/v1"
app.include_router(health.router, prefix=api_prefix)
app.include_router(auth.router, prefix=api_prefix)
app.include_router(clients.router, prefix=api_prefix)
app.include_router(items.router, prefix=api_prefix)
app.include_router(search.router, prefix=api_prefix)
app.include_router(audit.router, prefix=api_prefix)
app.include_router(backup.router, prefix=api_prefix)

static_dir = Path(os.getenv("STATIC_DIR", "/app/static"))
if static_dir.exists():
    assets = static_dir / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        candidate = static_dir / full_path
        if full_path and candidate.is_file() and static_dir in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")
