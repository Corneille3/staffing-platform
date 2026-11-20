"""platform_settings.lead_reminder_sent_on — the daily lead reminder's stamp.

The scheduler emails the owner and the marketing operators once a day about
the leads whose next action is due (SPEC_PLATFORM_LEADS §14 « Rappel des
suivis »). The day it last ran is kept in the database, not in memory: a
deploy reboots the container, and a restart must not send the email twice.

Additive; written against a LIVE prod DB.

Revision ID: 20261119_0028
Revises: 20261114_0027
Create Date: 2026-11-19 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20261119_0028'
down_revision = '20261114_0027'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('platform_settings', sa.Column('lead_reminder_sent_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('platform_settings', 'lead_reminder_sent_on')
