"""platform_settings (singleton) + platform_audit_log (PLATFORM_HANDOFF §2.3-2.4, §4).

- platform_settings: new-tenant defaults + the reserved-slug blocklist. One row,
  seeded with the spec defaults.
- platform_audit_log: the operator's own audit trail (separate from tenant events).

Additive; written against a LIVE prod DB.

Revision ID: 20260604_0014
Revises: 20260604_0013
Create Date: 2026-06-04 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260604_0014'
down_revision = '20260604_0013'
branch_labels = None
depends_on = None

DEFAULT_RESERVED_SLUGS = [
    'os', 'app', 'www', 'api', 'admin', 'login', 'pick', 'staff', 'support', 'help', 'status',
]


def upgrade() -> None:
    op.create_table(
        'platform_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('default_language', sa.String(20), nullable=False, server_default='fr'),
        sa.Column('trial_length_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('invite_expiry_days', sa.Integer(), nullable=False, server_default='14'),
        sa.Column('data_residency', sa.String(50), nullable=False, server_default='aws-ca-central-1'),
        sa.Column('orphan_retention_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('reserved_slugs', postgresql.JSONB(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Seed the singleton row.
    reserved = "'" + str(DEFAULT_RESERVED_SLUGS).replace("'", '"') + "'"
    op.execute(
        "INSERT INTO platform_settings (id, reserved_slugs) "
        f"VALUES (gen_random_uuid(), {reserved}::jsonb)"
    )

    op.create_table(
        'platform_audit_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('actor_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(80), nullable=False),
        sa.Column('target_type', sa.String(40), nullable=True),
        sa.Column('target_id', sa.String(80), nullable=True),
        sa.Column('payload', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('platform_audit_log')
    op.drop_table('platform_settings')
