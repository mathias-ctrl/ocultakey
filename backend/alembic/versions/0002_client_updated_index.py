"""index profiles by recent activity

Revision ID: 0002
Revises: 0001
"""
from alembic import op
from app.config import get_settings

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None
settings = get_settings()

def upgrade() -> None:
    op.create_index("ix_vault_clients_updated_at", "vault_clients", ["updated_at"], unique=False, schema=settings.database_schema)

def downgrade() -> None:
    op.drop_index("ix_vault_clients_updated_at", table_name="vault_clients", schema=settings.database_schema)
