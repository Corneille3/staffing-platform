"""Replacement escalation stamp.

Scheduler wiring (SELF_SERVE_REPLACEMENT §7 follow-through): the background
sweep warns the coordinator when a release/absence is still unfilled close to
the shift start. ``escalated_at`` records that the warning fired so the
coordinator is emailed exactly once per request, not on every sweep tick.

Additive + NULL-safe against the LIVE prod DB — existing rows keep NULL
(never escalated).

Revision ID: 20260610_0017
Revises: 20260609_0016
Create Date: 2026-06-10 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260610_0017'
down_revision = '20260609_0016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'staffing_requests',
        sa.Column('escalated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('staffing_requests', 'escalated_at')
