"""platform_operators table — tier-0 operator roles (PLATFORM_HANDOFF §1).

Adopts the 3-role model (owner/operator/support) layered on UserRole.PLATFORM_ADMIN.
Additive; seeds every existing platform_admin as `owner` so the current operator
(Josy) keeps full control. Written against a LIVE prod DB.

Revision ID: 20260604_0013
Revises: 20260603_0012
Create Date: 2026-06-04 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260604_0013'
down_revision = '20260603_0012'
branch_labels = None
depends_on = None

platform_operator_role = postgresql.ENUM(
    'owner', 'operator', 'support',
    name='platform_operator_role',
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    platform_operator_role.create(bind, checkfirst=True)

    op.create_table(
        'platform_operators',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('role', platform_operator_role, nullable=False, server_default='operator'),
        sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('invited_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Seed: existing platform_admins become owners (keep full control).
    op.execute(
        "INSERT INTO platform_operators (id, user_id, role, mfa_enabled, invited_at) "
        "SELECT gen_random_uuid(), id, 'owner', false, now() FROM users WHERE role = 'platform_admin'"
    )


def downgrade() -> None:
    op.drop_table('platform_operators')
    sa.Enum(name='platform_operator_role').drop(op.get_bind(), checkfirst=True)
