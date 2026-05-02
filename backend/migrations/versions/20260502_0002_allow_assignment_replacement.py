"""Allow assignment replacement after cancellation.

Revision ID: 20260502_0002
Revises: 20260420_0001
Create Date: 2026-05-02 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260502_0002'
down_revision = '20260420_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    constraints = {item['name'] for item in inspector.get_unique_constraints('assignments')}
    if 'assignments_staffing_request_id_key' in constraints:
        op.drop_constraint('assignments_staffing_request_id_key', 'assignments', type_='unique')


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    constraints = {item['name'] for item in inspector.get_unique_constraints('assignments')}
    if 'assignments_staffing_request_id_key' not in constraints:
        op.create_unique_constraint(
            'assignments_staffing_request_id_key',
            'assignments',
            ['staffing_request_id'],
        )
