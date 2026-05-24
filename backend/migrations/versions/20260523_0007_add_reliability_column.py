"""Add worker_profiles.reliability cache column (NETWORK_HANDOFF.md §8).

Stores the 0-100 reliability score per substitute. Refreshed by a periodic
compute job (not on every page load) — see WorkerService.recompute_reliability_*.

Revision ID: 20260523_0007
Revises: 20260512_0006
Create Date: 2026-05-23 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260523_0007'
down_revision = '20260512_0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'worker_profiles',
        sa.Column('reliability', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('worker_profiles', 'reliability')
