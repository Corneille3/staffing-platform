"""Tenant status gains a real terminal state: REMOVED.

Removal and suspension both wrote is_active=False and differed only by
status — removal left status='active', so the console had to filter on
is_active (PR #42), which then swallowed suspended tenants too (their
Reactivate button became unreachable). A distinct 'removed' status lets
the console filter on semantics instead of a shared boolean.

Data fix: rows removed before this migration (is_active=false but not
suspended) are relabeled 'removed'. Suspended rows are left alone —
they must reappear in the console.

ADD VALUE runs in an autocommit block: Postgres refuses to use a new
enum value inside the transaction that added it.

Revision ID: 20260806_0019
Revises: 20260611_0018
Create Date: 2026-08-06 00:00:00
"""
from alembic import op

revision = '20260806_0019'
down_revision = '20260611_0018'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'removed'")
    op.execute(
        "UPDATE tenants SET status = 'removed' "
        "WHERE is_active = false AND status <> 'suspended'"
    )


def downgrade() -> None:
    # Postgres cannot drop an enum value; map removed rows back to the old
    # representation (is_active=false already encodes the removal).
    op.execute("UPDATE tenants SET status = 'active' WHERE status = 'removed'")
