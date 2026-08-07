"""Normalize existing user emails to lowercase (Finding #2, 2026-08-07).

Invites now store emails lowercased at the schema boundary, and /auth/sync
compares case-insensitively. This backfills the rows that predate that so an
invite created as `Name@x.com` matches a Clerk sign-in of `name@x.com`.

Collision guard: `users.email` is UNIQUE, so if both `Name@x.com` and
`name@x.com` somehow exist (the live `+workerC` / `+workerc` leftover from
the 2026-08-06 test round), a blind LOWER() would violate the constraint.
We first tombstone the INACTIVE side of any such pair (same `+removed-`
marker the app uses), leaving the active row to take the clean address. If a
collision is between two active rows we leave both untouched (LOWER would
fail loudly — that needs a human, not a silent pick).

Revision ID: 20260807_0020
Revises: 20260806_0019
Create Date: 2026-08-07 00:00:00
"""
from alembic import op

revision = '20260807_0020'
down_revision = '20260806_0019'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Tombstone the inactive member of any case-collision pair so the
    #    canonical lowercase address is free for the active row.
    op.execute(
        """
        UPDATE users u
        SET email = split_part(u.email, '@', 1)
                    || '+removed-' || substr(md5(random()::text), 1, 12)
                    || '@' || split_part(u.email, '@', 2)
        WHERE u.is_active = false
          AND u.email <> lower(u.email)
          AND EXISTS (
              SELECT 1 FROM users other
              WHERE other.id <> u.id
                AND lower(other.email) = lower(u.email)
          )
        """
    )
    # 2) Lowercase everything that still differs and no longer collides.
    op.execute(
        """
        UPDATE users
        SET email = lower(email)
        WHERE email <> lower(email)
          AND NOT EXISTS (
              SELECT 1 FROM users other
              WHERE other.id <> users.id
                AND other.email = lower(users.email)
          )
        """
    )


def downgrade() -> None:
    # Lowercasing is not reversible (original case is lost); no-op.
    pass
