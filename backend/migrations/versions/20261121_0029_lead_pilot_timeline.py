"""platform_leads — the pilot's timeline (spec v1.1 §3.1, §4).

A lead only carried `converted_at`. The pilot runs in the prospect's real
workspace and has a planned end, so the pipeline needs its dates:

- `invited_at`        the tenant was created from the lead;
- `pilot_started_at`  the tenant's admin finished the setup wizard;
- `pilot_ends_at`     planned end of the pilot (+30 days, the operator edits it);
- `won_at`            the client committed — `converted_at`, renamed: it was
                      only ever written at `won`, and « converted » said less.

Existing leads are filled from their own feed (`invited` and
`tenant_activated` events). Written against a LIVE prod DB.

Revision ID: 20261121_0029
Revises: 20261119_0028
Create Date: 2026-11-21 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20261121_0029'
down_revision = '20261119_0028'
branch_labels = None
depends_on = None

PILOT_DAYS = 30


def upgrade() -> None:
    op.add_column('platform_leads', sa.Column('invited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('platform_leads', sa.Column('pilot_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('platform_leads', sa.Column('pilot_ends_at', sa.Date(), nullable=True))
    op.alter_column('platform_leads', 'converted_at', new_column_name='won_at')
    op.create_index(
        'ix_platform_leads_pilot_ends', 'platform_leads', ['pilot_ends_at'],
        postgresql_where=sa.text("status = 'pilot'"),
    )

    # The first event of each kind is the date: a lead is invited once, and a
    # second activation never restarts a pilot.
    op.execute("""
        UPDATE platform_leads AS lead
        SET invited_at = feed.at
        FROM (
            SELECT lead_id, MIN(created_at) AS at
            FROM platform_lead_events WHERE type = 'invited' GROUP BY lead_id
        ) AS feed
        WHERE feed.lead_id = lead.id
    """)
    op.execute(f"""
        UPDATE platform_leads AS lead
        SET pilot_started_at = feed.at,
            pilot_ends_at = (feed.at AT TIME ZONE 'America/Toronto')::date + {PILOT_DAYS}
        FROM (
            SELECT lead_id, MIN(created_at) AS at
            FROM platform_lead_events WHERE type = 'tenant_activated' GROUP BY lead_id
        ) AS feed
        WHERE feed.lead_id = lead.id
    """)


def downgrade() -> None:
    op.drop_index('ix_platform_leads_pilot_ends', table_name='platform_leads')
    op.alter_column('platform_leads', 'won_at', new_column_name='converted_at')
    op.drop_column('platform_leads', 'pilot_ends_at')
    op.drop_column('platform_leads', 'pilot_started_at')
    op.drop_column('platform_leads', 'invited_at')
