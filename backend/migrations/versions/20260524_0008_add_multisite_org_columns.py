"""Add multi-site descriptors to organizations (ADMIN_ORG_HISTORY_HANDOFF §1).

Adds (all nullable — additive, safe for a deployed DB):
- organizations.parent_organization_id (self-ref FK; NULL = parent/standalone)
- organizations.capacity
- organizations.enrolled_count
- organizations.hours_label

Revision ID: 20260524_0008
Revises: 20260523_0007
Create Date: 2026-05-24 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260524_0008'
down_revision = '20260523_0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'organizations',
        sa.Column('parent_organization_id', postgresql.UUID(as_uuid=False), nullable=True),
    )
    op.create_foreign_key(
        'fk_organizations_parent',
        'organizations',
        'organizations',
        ['parent_organization_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.add_column('organizations', sa.Column('capacity', sa.Integer(), nullable=True))
    op.add_column('organizations', sa.Column('enrolled_count', sa.Integer(), nullable=True))
    op.add_column('organizations', sa.Column('hours_label', sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column('organizations', 'hours_label')
    op.drop_column('organizations', 'enrolled_count')
    op.drop_column('organizations', 'capacity')
    op.drop_constraint('fk_organizations_parent', 'organizations', type_='foreignkey')
    op.drop_column('organizations', 'parent_organization_id')
