"""Promote APF_BOOTSTRAP_EMAIL user from network_admin to platform_admin

Idempotent. Reads ``APF_BOOTSTRAP_EMAIL`` from the env. If set, finds
the user and bumps their role to ``platform_admin``. Their existing
``TenantMembership`` (created by migration 20260507_0003) stays — the
DB-owns-roles model treats platform_admin as "network_admin of their
tenant + can also create/manage other tenants". Tenant scoping for
day-to-day data queries is preserved via that TenantMembership.

If the env var is not set or no matching user exists, the migration is
a no-op — useful for CI/test where bootstrap users aren't fixtured.

Revision ID: 20260510_0004
Revises: 20260507_0003
Create Date: 2026-05-10 00:00:00
"""
import os

from alembic import op
from sqlalchemy import text

revision = '20260510_0004'
down_revision = '20260507_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bootstrap_email = (os.environ.get('APF_BOOTSTRAP_EMAIL') or '').strip().lower()
    if not bootstrap_email:
        return

    conn = op.get_bind()
    conn.execute(
        text(
            "UPDATE users "
            "SET role = 'platform_admin' "
            "WHERE email = :email AND role <> 'platform_admin'"
        ),
        {'email': bootstrap_email},
    )


def downgrade() -> None:
    """Role downgrade is intentionally a no-op."""
    pass
