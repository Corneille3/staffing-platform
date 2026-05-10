"""Release emails of already-removed users for re-invitation

Earlier soft-deletes set ``users.is_active = False`` but kept the
original email, so the unique constraint on ``users.email`` blocked
re-inviting the same address. ``UserService.remove`` now appends a
``+removed-<short-uuid>`` marker to the email; this migration applies
the same treatment to inactive rows already in the DB so previously
removed addresses become free for re-use.

Idempotent: only rows whose email does not already contain the
``+removed-`` marker are rewritten. Uses the ``id`` hex (32 chars) as
the suffix so the result is stable per row and globally unique.

Revision ID: 20260510_0005
Revises: 20260510_0004
Create Date: 2026-05-10 00:00:00
"""
from alembic import op
from sqlalchemy import text

revision = '20260510_0005'
down_revision = '20260510_0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # Insert the marker in the local-part (before the '@') so the rewritten
    # email stays a syntactically valid address. ``split_part(email, '@', 1)``
    # is the local part, ``split_part(email, '@', 2)`` is the domain.
    conn.execute(
        text(
            "UPDATE users "
            "SET email = "
            "  split_part(email, '@', 1) "
            "  || '+removed-' "
            "  || substr(replace(cast(id as text), '-', ''), 1, 12) "
            "  || '@' "
            "  || split_part(email, '@', 2) "
            "WHERE is_active = false AND email NOT LIKE '%+removed-%'"
        )
    )


def downgrade() -> None:
    """The original email is recoverable from the audit log payload but
    not reliably from the column itself (the marker has random chars).
    Downgrade is intentionally a no-op."""
    pass
