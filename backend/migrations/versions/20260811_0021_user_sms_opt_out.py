"""Per-user SMS opt-out (SMS reply-to-claim spec, Feature 1 step 1).

Lives on `users`, not `worker_profiles`, for three reasons:
  * `users.phone` is the column this permission governs — flag and number
    belong on the same row.
  * `NotificationDispatcher._send_to_worker` already holds a `User`, so the
    skip is one attribute instead of a lazy 1:1 load per worker on every
    broadcast fan-out.
  * An inbound STOP/ARRET arrives as a bare phone number with no profile
    context, and `worker_profiles` is ON DELETE CASCADE — a profile that
    never existed (invited, not yet onboarded) or later disappears would
    leave a legally binding opt-out with nowhere to live.

Default false: every existing row keeps receiving SMS exactly as before, so
no backfill is needed. The flag is deliberately negative — the event that
actually fires is someone opting *out*.

Revision ID: 20260811_0021
Revises: 20260807_0020
Create Date: 2026-08-11 00:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = '20260811_0021'
down_revision = '20260807_0020'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('sms_opt_out', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('users', 'sms_opt_out')
