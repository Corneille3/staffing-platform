"""Check-out, worked hours & geofence (SPEC_CHECKOUT_HOURS §1).

Assignments gain the other half of the attendance pair: `checked_out_at` plus
its geo stamp, and the audit trail of a coordinator time correction
(`hours_adjusted_*`). Worked hours are derived (`checked_out_at −
checked_in_at`), never stored — storing a duration invites drift the moment a
timestamp is corrected.

Organizations gain `geofence_radius_m` — NULL means "use the platform default"
(`settings.geofence_default_radius_m`); the per-site column exists so a rural
site with a huge parking lot can widen it without touching anyone else.

Revision ID: 20260816_0023
Revises: 20260811_0022
Create Date: 2026-08-16 00:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = '20260816_0023'
down_revision = '20260811_0022'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('assignments', sa.Column('checked_out_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('assignments', sa.Column('checked_out_latitude', sa.Numeric(9, 6), nullable=True))
    op.add_column('assignments', sa.Column('checked_out_longitude', sa.Numeric(9, 6), nullable=True))
    op.add_column(
        'assignments',
        sa.Column(
            'hours_adjusted_by_user_id', sa.UUID(),
            sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True,
        ),
    )
    op.add_column('assignments', sa.Column('hours_adjusted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('assignments', sa.Column('hours_adjustment_reason', sa.Text(), nullable=True))

    op.add_column('organizations', sa.Column('geofence_radius_m', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('organizations', 'geofence_radius_m')
    op.drop_column('assignments', 'hours_adjustment_reason')
    op.drop_column('assignments', 'hours_adjusted_at')
    op.drop_column('assignments', 'hours_adjusted_by_user_id')
    op.drop_column('assignments', 'checked_out_longitude')
    op.drop_column('assignments', 'checked_out_latitude')
    op.drop_column('assignments', 'checked_out_at')
