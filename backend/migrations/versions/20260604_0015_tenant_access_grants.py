"""tenant_access_grants + access settings (PLATFORM_HANDOFF §2.2).

- tenant_access_grants: the logged, consented, time-boxed exception to the
  tier-0 privacy boundary. One row per access request.
- platform_settings gains access_requires_approval (default ON) and
  access_window_hours (default 4h).

Additive; written against a LIVE prod DB.

Revision ID: 20260604_0015
Revises: 20260604_0014
Create Date: 2026-06-04 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260604_0015'
down_revision = '20260604_0014'
branch_labels = None
depends_on = None

grant_status = postgresql.ENUM(
    'requested', 'approved', 'active', 'expired', 'denied',
    name='tenant_access_grant_status',
    create_type=False,  # created explicitly in upgrade() — avoids the double CREATE TYPE
)


def upgrade() -> None:
    grant_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        'tenant_access_grants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('operator_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reason', sa.String(500), nullable=False),
        sa.Column('status', grant_status, nullable=False, server_default='requested'),
        sa.Column('requested_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('approved_by_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        'ix_tenant_access_grants_operator_tenant',
        'tenant_access_grants', ['operator_user_id', 'tenant_id'],
    )

    op.add_column('platform_settings', sa.Column(
        'access_requires_approval', sa.Boolean(), nullable=False, server_default='true',
    ))
    op.add_column('platform_settings', sa.Column(
        'access_window_hours', sa.Integer(), nullable=False, server_default='4',
    ))


def downgrade() -> None:
    op.drop_column('platform_settings', 'access_window_hours')
    op.drop_column('platform_settings', 'access_requires_approval')
    op.drop_index('ix_tenant_access_grants_operator_tenant', table_name='tenant_access_grants')
    op.drop_table('tenant_access_grants')
    grant_status.drop(op.get_bind(), checkfirst=True)
