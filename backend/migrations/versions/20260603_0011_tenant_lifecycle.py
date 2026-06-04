"""Tenant lifecycle columns: status, region, activated_at (MULTITENANCY_HANDOFF §4).

Multi-tenancy Phase 0. Additive + NULL-safe against the LIVE prod DB.
- status (new `tenant_status` enum): pending | onboarding | active | suspended.
  Backfills existing tenants to 'active' via server_default.
- region: free-text region label.
- activated_at: when the tenant went live; backfilled to created_at for the
  existing (active) tenants.

`is_active` is kept as the soft-delete/removal flag; `status` is the lifecycle.

Revision ID: 20260603_0011
Revises: 20260531_0010
Create Date: 2026-06-03 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260603_0011'
down_revision = '20260531_0010'
branch_labels = None
depends_on = None

tenant_status = postgresql.ENUM(
    'pending', 'onboarding', 'active', 'suspended',
    name='tenant_status',
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    tenant_status.create(bind, checkfirst=True)

    op.add_column(
        'tenants',
        sa.Column('status', tenant_status, nullable=False, server_default='active'),
    )
    op.add_column('tenants', sa.Column('region', sa.String(100), nullable=True))
    op.add_column('tenants', sa.Column('activated_at', sa.DateTime(timezone=True), nullable=True))

    # Existing tenants are live — stamp their activation as their creation time.
    op.execute("UPDATE tenants SET activated_at = created_at WHERE activated_at IS NULL")


def downgrade() -> None:
    op.drop_column('tenants', 'activated_at')
    op.drop_column('tenants', 'region')
    op.drop_column('tenants', 'status')
    sa.Enum(name='tenant_status').drop(op.get_bind(), checkfirst=True)
