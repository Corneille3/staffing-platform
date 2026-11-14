"""Tier-0 operator role `marketing` (SPEC_PLATFORM_LEADS).

Owns the sales pipeline (/platform/leads) and nothing else. ADD VALUE runs
in an autocommit block: Postgres refuses to use a new enum value inside the
transaction that added it.

Revision ID: 20261114_0026
Revises: 20260822_0025
Create Date: 2026-11-14 00:00:00
"""
from alembic import op

revision = '20261114_0026'
down_revision = '20260822_0025'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE platform_operator_role ADD VALUE IF NOT EXISTS 'marketing'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; fold marketing operators back into
    # the most restricted pre-existing role.
    op.execute("UPDATE platform_operators SET role = 'support' WHERE role = 'marketing'")
