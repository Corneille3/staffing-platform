"""Add tenants.preferred_language (onboarding wizard step 1, MULTITENANCY §6).

Multi-tenancy Phase 2. The network's primary language, set in the wizard.
Additive, String(20) (room for 'bilingual'), default 'fr'.

Revision ID: 20260603_0012
Revises: 20260603_0011
Create Date: 2026-06-03 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260603_0012'
down_revision = '20260603_0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'tenants',
        sa.Column('preferred_language', sa.String(20), nullable=False, server_default='fr'),
    )


def downgrade() -> None:
    op.drop_column('tenants', 'preferred_language')
