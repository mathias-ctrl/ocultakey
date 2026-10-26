"""sector shared vaults and account roles

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
from app.config import get_settings

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None
schema = get_settings().database_schema


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(120), nullable=False, server_default=""), schema=schema)
    op.add_column("users", sa.Column("role", sa.String(24), nullable=False, server_default="member"), schema=schema)
    op.execute(sa.text(f"UPDATE {schema}.users SET role='superadmin' WHERE id=(SELECT id FROM {schema}.users ORDER BY created_at LIMIT 1)"))
    op.create_table(
        "sectors",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("rotation_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rotation_marked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotation_marked_by", sa.Uuid(), sa.ForeignKey(f"{schema}.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema=schema,
    )
    op.create_table(
        "sector_memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("sector_id", sa.Uuid(), sa.ForeignKey(f"{schema}.sectors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey(f"{schema}.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("wrapped_sector_key", sa.LargeBinary(), nullable=False),
        sa.Column("key_nonce", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("sector_id", "user_id", name="uq_sector_membership"),
        schema=schema,
    )
    op.create_index("ix_sector_memberships_sector_id", "sector_memberships", ["sector_id"], schema=schema)
    op.create_index("ix_sector_memberships_user_id", "sector_memberships", ["user_id"], schema=schema)
    op.add_column("vault_clients", sa.Column("sector_id", sa.Uuid(), sa.ForeignKey(f"{schema}.sectors.id", ondelete="CASCADE"), nullable=True), schema=schema)
    op.add_column("vault_items", sa.Column("sector_id", sa.Uuid(), sa.ForeignKey(f"{schema}.sectors.id", ondelete="CASCADE"), nullable=True), schema=schema)
    op.add_column("search_tokens", sa.Column("sector_id", sa.Uuid(), sa.ForeignKey(f"{schema}.sectors.id", ondelete="CASCADE"), nullable=True), schema=schema)
    op.create_index("ix_vault_clients_sector_id", "vault_clients", ["sector_id"], schema=schema)
    op.create_index("ix_vault_items_sector_id", "vault_items", ["sector_id"], schema=schema)
    op.create_index("ix_search_tokens_sector_id", "search_tokens", ["sector_id"], schema=schema)


def downgrade() -> None:
    op.drop_index("ix_vault_items_sector_id", table_name="vault_items", schema=schema)
    op.drop_index("ix_search_tokens_sector_id", table_name="search_tokens", schema=schema)
    op.drop_column("search_tokens", "sector_id", schema=schema)
    op.drop_index("ix_vault_clients_sector_id", table_name="vault_clients", schema=schema)
    op.drop_column("vault_items", "sector_id", schema=schema)
    op.drop_column("vault_clients", "sector_id", schema=schema)
    op.drop_index("ix_sector_memberships_user_id", table_name="sector_memberships", schema=schema)
    op.drop_index("ix_sector_memberships_sector_id", table_name="sector_memberships", schema=schema)
    op.drop_table("sector_memberships", schema=schema)
    op.drop_table("sectors", schema=schema)
    op.drop_column("users", "role", schema=schema)
    op.drop_column("users", "display_name", schema=schema)
