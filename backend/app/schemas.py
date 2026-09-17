from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    auth_proof: str = Field(min_length=20, max_length=512)
    device_name: str = Field(default="Browser", max_length=160)


class ReauthRequest(BaseModel):
    auth_proof: str = Field(min_length=20, max_length=512)
    purpose: str = Field(default="sensitive_action", max_length=64)


class CipherBlob(BaseModel):
    ciphertext: str
    nonce: str
    crypto_version: int = 1


class VaultBundleOut(BaseModel):
    kdf_salt: str
    kdf_memory_kib: int
    kdf_iterations: int
    kdf_parallelism: int
    wrapped_metadata_key: str
    metadata_key_nonce: str
    wrapped_search_key: str
    search_key_nonce: str
    wrapped_secret_key: str
    secret_key_nonce: str
    crypto_version: int


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    vault: VaultBundleOut


class ClientCreate(BaseModel):
    metadata: CipherBlob
    search_tokens: list[str] = Field(default_factory=list, max_length=500)
    favorite: bool = False


class ClientUpdate(ClientCreate):
    pass


class ClientOut(BaseModel):
    id: UUID
    metadata: CipherBlob
    favorite: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ClientPage(BaseModel):
    items: list[ClientOut]
    next_cursor: str | None = None


class ItemCreate(BaseModel):
    client_id: UUID
    metadata: CipherBlob
    secret: CipherBlob
    search_tokens: list[str] = Field(default_factory=list, max_length=1000)
    favorite: bool = False


class ItemUpdate(BaseModel):
    metadata: CipherBlob
    secret: CipherBlob
    search_tokens: list[str] = Field(default_factory=list, max_length=1000)
    favorite: bool = False


class ItemOut(BaseModel):
    id: UUID
    client_id: UUID
    metadata: CipherBlob
    secret: CipherBlob
    favorite: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ItemPage(BaseModel):
    items: list[ItemOut]
    next_cursor: str | None = None


class SearchRequest(BaseModel):
    tokens: list[str] = Field(min_length=1, max_length=64)
    scope: Literal["all", "clients", "items"] = "all"
    client_id: UUID | None = None
    limit: int = Field(default=50, ge=1, le=100)


class SearchResponse(BaseModel):
    clients: list[ClientOut] = Field(default_factory=list)
    items: list[ItemOut] = Field(default_factory=list)


class AuditClientEvent(BaseModel):
    event: Literal["SECRET_REVEALED", "SECRET_COPIED", "CSV_EXPORTED", "OKY_EXPORTED"]
    object_type: Literal["item", "vault"] | None = None
    object_id: UUID | None = None


class DriveFolderSelection(BaseModel):
    folder_id: str = Field(min_length=1, max_length=255)
