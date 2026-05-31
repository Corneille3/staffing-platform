"""Widen preferred_language from String(5) to String(20) on users + organizations.

E2E bug #1 (2026-05-31): worker onboarding with language "bilingual" (9 chars)
raised StringDataRightTruncation -> unhandled 500. The onboarding allow-list
already accepts 'fr' | 'en' | 'bilingual'; the column just couldn't hold it.
organizations.preferred_language is the same field with the same width, reachable
the same way via org creation, so it is widened in lockstep.

Additive + NULL-safe. Widening a varchar in Postgres is a metadata-only change
(no table rewrite). First migration written against a LIVE prod database, so it
is additive rather than an in-place edit of the initial schema.

Revision ID: 20260531_0009
Revises: 20260524_0008
Create Date: 2026-05-31 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260531_0009'
down_revision = '20260524_0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ('users', 'organizations'):
        op.alter_column(
            table,
            'preferred_language',
            existing_type=sa.String(length=5),
            type_=sa.String(length=20),
            existing_nullable=False,
            existing_server_default='fr',
        )


def downgrade() -> None:
    for table in ('users', 'organizations'):
        # Best-effort reverse. Any value longer than 5 chars (e.g. 'bilingual')
        # would block the shrink, so collapse those to 'fr' first.
        op.execute(
            f"UPDATE {table} SET preferred_language = 'fr' "
            "WHERE length(preferred_language) > 5"
        )
        op.alter_column(
            table,
            'preferred_language',
            existing_type=sa.String(length=20),
            type_=sa.String(length=5),
            existing_nullable=False,
            existing_server_default='fr',
        )
