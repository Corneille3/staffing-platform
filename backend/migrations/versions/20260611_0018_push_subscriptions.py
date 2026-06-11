"""Web Push subscriptions (PWA).

One row per browser/device a worker enabled push notifications on. The
endpoint URL is the natural key (unique) — re-subscribing the same browser
upserts. Additive against the LIVE prod DB; no existing rows touched.

Revision ID: 20260611_0018
Revises: 20260610_0017
Create Date: 2026-06-11 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260611_0018'
down_revision = '20260610_0017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False, unique=True),
        sa.Column('p256dh', sa.String(length=255), nullable=False),
        sa.Column('auth', sa.String(length=255), nullable=False),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
