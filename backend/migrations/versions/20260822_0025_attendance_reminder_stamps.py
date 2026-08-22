"""Idempotence stamps for attendance reminders/alerts (SPEC_NOSHOW shared plumbing).

The attendance sweep repasses every tick and must never re-send: one
check-in reminder, one check-out reminder, one no-show alert per
assignment, each stamped when fired. Timestamps double as audit ("has
this fired?" is answerable by looking at the row). Chosen over a generic
sent-log table to keep the sweep query a single table scan with IS NULL
filters.

Revision ID: 20260822_0025
Revises: 20260822_0024
Create Date: 2026-08-22 00:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = '20260822_0025'
down_revision = '20260822_0024'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('assignments', sa.Column('checkin_reminder_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('assignments', sa.Column('checkout_reminder_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('assignments', sa.Column('no_show_alerted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('assignments', 'no_show_alerted_at')
    op.drop_column('assignments', 'checkout_reminder_sent_at')
    op.drop_column('assignments', 'checkin_reminder_sent_at')
