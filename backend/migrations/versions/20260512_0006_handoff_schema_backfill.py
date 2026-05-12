"""Backfill HANDOFF.md schema additions.

Adds:
- requests.role + RequestRole enum (educator, psw, nurse, ...)
- requests.hourly_rate
- organizations.neighbourhood, latitude, longitude
- worker_profiles.home_latitude, home_longitude, notify_far,
  notify_weekend_overnight
- assignments.checked_in_at, checked_in_latitude, checked_in_longitude
- request_notifications.match_score
- new `availabilities` table + SlotPeriod enum (weekly grid)

Revision ID: 20260512_0006
Revises: 20260510_0005
Create Date: 2026-05-12 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260512_0006'
down_revision = '20260510_0005'
branch_labels = None
depends_on = None


request_role = postgresql.ENUM(
    'educator', 'assistant_educator', 'psw', 'nurse', 'food_handler', 'other',
    name='request_role',
    create_type=False,
)
slot_period = postgresql.ENUM(
    'morning', 'afternoon', 'evening', 'overnight',
    name='slot_period',
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    request_role.create(bind, checkfirst=True)
    slot_period.create(bind, checkfirst=True)

    # staffing_requests
    op.add_column('staffing_requests', sa.Column('role', request_role, nullable=True))
    op.add_column('staffing_requests', sa.Column('hourly_rate', sa.Numeric(6, 2), nullable=True))

    # organizations
    op.add_column('organizations', sa.Column('neighbourhood', sa.String(100), nullable=True))
    op.add_column('organizations', sa.Column('latitude', sa.Numeric(9, 6), nullable=True))
    op.add_column('organizations', sa.Column('longitude', sa.Numeric(9, 6), nullable=True))

    # worker_profiles
    op.add_column('worker_profiles', sa.Column('home_latitude', sa.Numeric(9, 6), nullable=True))
    op.add_column('worker_profiles', sa.Column('home_longitude', sa.Numeric(9, 6), nullable=True))
    op.add_column(
        'worker_profiles',
        sa.Column('notify_far', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'worker_profiles',
        sa.Column('notify_weekend_overnight', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # assignments check-in
    op.add_column('assignments', sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('assignments', sa.Column('checked_in_latitude', sa.Numeric(9, 6), nullable=True))
    op.add_column('assignments', sa.Column('checked_in_longitude', sa.Numeric(9, 6), nullable=True))

    # request_notifications.match_score
    op.add_column('request_notifications', sa.Column('match_score', sa.Numeric(5, 2), nullable=True))

    # availabilities (weekly grid)
    op.create_table(
        'availabilities',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('day_of_week', sa.SmallInteger(), nullable=True),
        sa.Column('specific_date', sa.Date(), nullable=True),
        sa.Column('slot', slot_period, nullable=False),
        sa.Column('available', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            '(day_of_week IS NOT NULL) OR (specific_date IS NOT NULL)',
            name='ck_availabilities_recurring_or_specific',
        ),
        sa.CheckConstraint(
            '(day_of_week IS NULL) OR (day_of_week BETWEEN 0 AND 6)',
            name='ck_availabilities_day_of_week_range',
        ),
    )
    op.create_index('ix_availabilities_user_id', 'availabilities', ['user_id'])
    op.create_unique_constraint(
        'uq_availabilities_recurring',
        'availabilities',
        ['user_id', 'day_of_week', 'slot'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_availabilities_recurring', 'availabilities', type_='unique')
    op.drop_index('ix_availabilities_user_id', table_name='availabilities')
    op.drop_table('availabilities')

    op.drop_column('request_notifications', 'match_score')

    op.drop_column('assignments', 'checked_in_longitude')
    op.drop_column('assignments', 'checked_in_latitude')
    op.drop_column('assignments', 'checked_in_at')

    op.drop_column('worker_profiles', 'notify_weekend_overnight')
    op.drop_column('worker_profiles', 'notify_far')
    op.drop_column('worker_profiles', 'home_longitude')
    op.drop_column('worker_profiles', 'home_latitude')

    op.drop_column('organizations', 'longitude')
    op.drop_column('organizations', 'latitude')
    op.drop_column('organizations', 'neighbourhood')

    op.drop_column('staffing_requests', 'hourly_rate')
    op.drop_column('staffing_requests', 'role')

    bind = op.get_bind()
    sa.Enum(name='slot_period').drop(bind, checkfirst=True)
    sa.Enum(name='request_role').drop(bind, checkfirst=True)
