"""APF bootstrap: seed first network_admin + APF tenant

Idempotent data migration. Reads ``APF_BOOTSTRAP_EMAIL`` (and optional
``APF_BOOTSTRAP_FIRST_NAME`` / ``APF_BOOTSTRAP_LAST_NAME``) from the
environment to know who the first network_admin is. If the env var is
not set, the migration is a no-op — useful for CI / test environments
where bootstrap data is provided by fixtures.

The migration:
  1. Ensures the APF tenant row exists (slug=apf-network).
  2. Ensures a users row exists for the bootstrap email with role
     network_admin.
  3. Ensures an active TenantMembership links them as network_admin.

Re-runs are safe: each step checks for existing rows before inserting.
``clerk_user_id`` is intentionally left null — the user's first
``/auth/sync`` will link it.

Revision ID: 20260507_0003
Revises: 20260502_0002
Create Date: 2026-05-07 00:00:00
"""
import os
import uuid

from alembic import op
from sqlalchemy import text

revision = '20260507_0003'
down_revision = '20260502_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bootstrap_email = (os.environ.get('APF_BOOTSTRAP_EMAIL') or '').strip().lower()
    if not bootstrap_email:
        return

    first_name = (os.environ.get('APF_BOOTSTRAP_FIRST_NAME') or 'APF').strip() or 'APF'
    last_name = (os.environ.get('APF_BOOTSTRAP_LAST_NAME') or 'Admin').strip() or 'Admin'

    conn = op.get_bind()

    tenant_id = conn.execute(
        text("SELECT id FROM tenants WHERE slug = 'apf-network'")
    ).scalar()
    if tenant_id is None:
        tenant_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO tenants (id, name, slug, is_active) "
                "VALUES (:id, 'APF Network', 'apf-network', true)"
            ),
            {'id': str(tenant_id)},
        )

    user_row = conn.execute(
        text("SELECT id, role FROM users WHERE email = :email"),
        {'email': bootstrap_email},
    ).first()
    if user_row is None:
        user_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO users (id, email, first_name, last_name, role, is_active, preferred_language) "
                "VALUES (:id, :email, :first, :last, 'network_admin', true, 'fr')"
            ),
            {
                'id': str(user_id),
                'email': bootstrap_email,
                'first': first_name,
                'last': last_name,
            },
        )
    else:
        user_id = user_row[0]
        if user_row[1] != 'network_admin':
            conn.execute(
                text("UPDATE users SET role = 'network_admin' WHERE id = :id"),
                {'id': str(user_id)},
            )

    membership_id = conn.execute(
        text(
            "SELECT id FROM tenant_memberships "
            "WHERE user_id = :uid AND tenant_id = :tid"
        ),
        {'uid': str(user_id), 'tid': str(tenant_id)},
    ).scalar()
    if membership_id is None:
        conn.execute(
            text(
                "INSERT INTO tenant_memberships (id, user_id, tenant_id, role, is_active) "
                "VALUES (:id, :uid, :tid, 'network_admin', true)"
            ),
            {
                'id': str(uuid.uuid4()),
                'uid': str(user_id),
                'tid': str(tenant_id),
            },
        )
    else:
        conn.execute(
            text(
                "UPDATE tenant_memberships SET role = 'network_admin', is_active = true "
                "WHERE id = :id"
            ),
            {'id': str(membership_id)},
        )


def downgrade() -> None:
    """Bootstrap data is intentionally not removed on rollback."""
    pass
