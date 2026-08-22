"""Worker org opt-in: the worker_organizations join table.

Workers previously had no org-level link — only TenantMembership — so every
org's shifts broadcast to every matching worker in the tenant. This table
lets a worker pick which organizations they'll work with (caregiver-field
feedback 2026-08-09).

Opt-out model: no active rows for a worker = open to all orgs, which is why
there is no backfill — existing workers keep exactly their current reach
until they make a selection.

Deliberately separate from organization_memberships: admin queries
(coordinator listings, org drill-ins) read that table without a role filter,
so worker rows there would surface as coordinators.

Revision ID: 20260822_0024
Revises: 20260816_0023
Create Date: 2026-08-22 00:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = '20260822_0024'
down_revision = '20260816_0023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'worker_organizations',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization_id', sa.UUID(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'organization_id', name='uq_worker_organization'),
    )
    op.create_index('ix_worker_organizations_user_id', 'worker_organizations', ['user_id'])
    op.create_index('ix_worker_organizations_organization_id', 'worker_organizations', ['organization_id'])


def downgrade() -> None:
    op.drop_index('ix_worker_organizations_organization_id', table_name='worker_organizations')
    op.drop_index('ix_worker_organizations_user_id', table_name='worker_organizations')
    op.drop_table('worker_organizations')
