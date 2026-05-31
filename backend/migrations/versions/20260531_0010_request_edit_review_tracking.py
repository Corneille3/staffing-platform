"""Track content edits + per-worker review for the "task modified" banner.

Follow-up to edit-after-publish (#6): when a coordinator edits a published
request, notified workers should see a "this changed — please review" cue.

- staffing_requests.content_last_edited_at: stamped only when update_draft
  changes real content on an already-published request (NOT on drafts, NOT on
  status transitions — so it's a clean "the shift details changed" signal).
- request_responses.last_reviewed_at: bumped every time the worker opens the
  request (mark_viewed), so the banner clears once they've looked again.

Both nullable + additive. Written against a LIVE prod DB.

Revision ID: 20260531_0010
Revises: 20260531_0009
Create Date: 2026-05-31 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260531_0010'
down_revision = '20260531_0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'staffing_requests',
        sa.Column('content_last_edited_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'request_responses',
        sa.Column('last_reviewed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('request_responses', 'last_reviewed_at')
    op.drop_column('staffing_requests', 'content_last_edited_at')
