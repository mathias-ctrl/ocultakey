from __future__ import annotations

from sqlalchemy import select

from .config import get_settings
from .database import db_session
from .models import User
from .security import b64e, build_vault_bundle, derive_auth_proof, derive_kek, hash_auth_proof

settings = get_settings()


def bootstrap_admin() -> None:
    with db_session() as db:
        existing = db.scalar(select(User).limit(1))
        if existing:
            return
        if not settings.bootstrap_email or not settings.bootstrap_password:
            raise RuntimeError(
                "No user exists. Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD for the first start. "
                "After the first successful login, remove BOOTSTRAP_PASSWORD from the environment."
            )
        user = User(
            email=settings.bootstrap_email.strip().lower(),
            auth_proof_hash="pending",
            bootstrap_created=True,
        )
        db.add(user)
        db.flush()
        bundle = build_vault_bundle(user.id, settings.bootstrap_password)
        kek = derive_kek(settings.bootstrap_password, bundle.kdf_salt, bundle.kdf_memory_kib, bundle.kdf_iterations, bundle.kdf_parallelism)
        user.auth_proof_hash = hash_auth_proof(b64e(derive_auth_proof(kek)))
        db.add(bundle)
