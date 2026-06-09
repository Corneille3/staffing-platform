"""Self-serve replacement: request origin/auto-assign, employment type, per-org policy.

SELF_SERVE_REPLACEMENT_HANDOFF §1 + §5. Additive + NULL-safe against the LIVE
prod DB — every new column carries a server_default, so existing rows are
unchanged: requests stay origin=coordinator / auto_assign=false, members default
to contractor, orgs default to the auto policy with the care-giving roles.

New enums: request_origin, employment_type, replacement_policy.
New values on existing enums: assignment_status += released,
request_status += pending_approval (added via autocommit_block — PG can't use a
new enum value in the same transaction that adds it).

Revision ID: 20260609_0016
Revises: 20260604_0015
Create Date: 2026-06-09 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260609_0016'
down_revision = '20260604_0015'
branch_labels = None
depends_on = None

request_origin = postgresql.ENUM(
    'coordinator', 'worker_replacement', 'staff_absence',
    name='request_origin', create_type=False,
)
employment_type = postgresql.ENUM(
    'permanent', 'contractor',
    name='employment_type', create_type=False,
)
replacement_policy = postgresql.ENUM(
    'auto', 'managed',
    name='replacement_policy', create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    request_origin.create(bind, checkfirst=True)
    employment_type.create(bind, checkfirst=True)
    replacement_policy.create(bind, checkfirst=True)

    # ALTER TYPE ... ADD VALUE must be committed before the value can be used,
    # so it runs outside the migration transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE assignment_status ADD VALUE IF NOT EXISTS 'released'")
        op.execute("ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'pending_approval'")

    # staffing_requests — self-serve origin + the released-assignment pointer.
    op.add_column('staffing_requests', sa.Column(
        'origin', request_origin, nullable=False, server_default='coordinator'))
    op.add_column('staffing_requests', sa.Column(
        'auto_assign', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('staffing_requests', sa.Column(
        'replaces_assignment_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_staffing_requests_replaces_assignment',
        'staffing_requests', 'assignments',
        ['replaces_assignment_id'], ['id'], ondelete='SET NULL')
    op.add_column('staffing_requests', sa.Column(
        'release_reason', sa.String(length=20), nullable=True))

    # tenant_memberships — employment type (set by the tenant admin at invite).
    op.add_column('tenant_memberships', sa.Column(
        'employment_type', employment_type, nullable=False, server_default='contractor'))

    # organizations — per-org self-serve policy.
    op.add_column('organizations', sa.Column(
        'replacement_policy', replacement_policy, nullable=False, server_default='auto'))
    op.add_column('organizations', sa.Column(
        'replacement_allowed_roles', postgresql.JSONB(), nullable=False,
        server_default=sa.text("""'["educator","assistant_educator","psw","nurse"]'::jsonb""")))
    op.add_column('organizations', sa.Column(
        'min_release_lead_minutes', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('organizations', 'min_release_lead_minutes')
    op.drop_column('organizations', 'replacement_allowed_roles')
    op.drop_column('organizations', 'replacement_policy')
    op.drop_column('tenant_memberships', 'employment_type')
    op.drop_constraint(
        'fk_staffing_requests_replaces_assignment', 'staffing_requests', type_='foreignkey')
    op.drop_column('staffing_requests', 'release_reason')
    op.drop_column('staffing_requests', 'replaces_assignment_id')
    op.drop_column('staffing_requests', 'auto_assign')
    op.drop_column('staffing_requests', 'origin')

    replacement_policy.drop(op.get_bind(), checkfirst=True)
    employment_type.drop(op.get_bind(), checkfirst=True)
    request_origin.drop(op.get_bind(), checkfirst=True)
    # PG can't DROP an enum value, so 'released' / 'pending_approval' stay on
    # assignment_status / request_status after a downgrade — harmless.
