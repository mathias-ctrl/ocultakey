"""enforce user and sector boundaries with PostgreSQL RLS

Revision ID: 0004
Revises: 0003
"""
from alembic import op
from app.config import get_settings

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None
schema = get_settings().database_schema


def upgrade() -> None:
    import sqlalchemy as sa
    op.add_column("audit_events", sa.Column("sector_id", sa.Uuid(), sa.ForeignKey(f"{schema}.sectors.id", ondelete="CASCADE"), nullable=True), schema=schema)
    op.create_index("ix_audit_events_sector_id", "audit_events", ["sector_id"], schema=schema)
    personal = "user_id = nullif(current_setting('app.user_id', true), '')::uuid AND sector_id IS NULL"
    admin = "current_setting('app.role', true) = 'superadmin'"

    for table in ("vault_clients", "vault_items", "search_tokens", "audit_events"):
        sector = f"sector_id = nullif(current_setting('app.sector_id', true), '')::uuid AND EXISTS (SELECT 1 FROM {schema}.sector_memberships sm WHERE sm.sector_id = {table}.sector_id AND sm.user_id = nullif(current_setting('app.user_id', true), '')::uuid AND sm.revoked_at IS NULL)"
        op.execute(f"ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_scope ON {schema}.{table} USING (({personal}) OR ({sector})) WITH CHECK (({personal}) OR ({sector}))")

    op.execute(f"ALTER TABLE {schema}.sectors ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {schema}.sectors FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY sector_visibility ON {schema}.sectors USING (({admin}) OR EXISTS (SELECT 1 FROM {schema}.sector_memberships sm WHERE sm.sector_id = id AND sm.user_id = nullif(current_setting('app.user_id', true), '')::uuid AND sm.revoked_at IS NULL)) WITH CHECK ({admin})")

    op.execute(f"ALTER TABLE {schema}.sector_memberships ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {schema}.sector_memberships FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY sector_membership_visibility ON {schema}.sector_memberships USING (({admin}) OR user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ({admin})")


def downgrade() -> None:
    for table, policy in (("sector_memberships", "sector_membership_visibility"), ("sectors", "sector_visibility"), ("audit_events", "tenant_scope"), ("search_tokens", "tenant_scope"), ("vault_items", "tenant_scope"), ("vault_clients", "tenant_scope")):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {schema}.{table}")
        op.execute(f"ALTER TABLE {schema}.{table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {schema}.{table} DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_audit_events_sector_id", table_name="audit_events", schema=schema)
    op.drop_column("audit_events", "sector_id", schema=schema)
