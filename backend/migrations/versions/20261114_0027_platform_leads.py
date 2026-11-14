"""platform_leads + platform_lead_events (SPEC_PLATFORM_LEADS).

The operator-level sales pipeline: prospects before any tenant exists.

Deviations from the spec's SQL, all decided with the product owner:
- one link to the tenant (platform_leads.tenant_id, unique) instead of the
  tenants.lead_id / converted_tenant_id pair — `tenants` is not touched;
- only `status` is a Postgres enum; segment, kind, source, ban phase and
  event type are strings validated in the API layer;
- created_by references users.id (the Clerk id is a string in this schema)
  and is nullable for system-created leads.

Additive; written against a LIVE prod DB.

Revision ID: 20261114_0027
Revises: 20261114_0026
Create Date: 2026-11-14 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261114_0027'
down_revision = '20261114_0026'
branch_labels = None
depends_on = None

lead_status = postgresql.ENUM(
    'new', 'contacted', 'demo_booked', 'pilot', 'invited', 'won', 'lost',
    name='lead_status',
    create_type=False,  # created explicitly in upgrade() — avoids the double CREATE TYPE
)


def upgrade() -> None:
    lead_status.create(op.get_bind(), checkfirst=True)
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        'platform_leads',
        sa.Column('id', uuid, primary_key=True),
        sa.Column('external_ref', sa.String(40), nullable=True, unique=True),
        sa.Column('org_name', sa.String(255), nullable=False),
        sa.Column('segment', sa.String(40), nullable=False),
        sa.Column('subtype', sa.String(120), nullable=True),
        sa.Column('kind', sa.String(20), nullable=False, server_default='prospect'),
        sa.Column('site_count', sa.Integer(), nullable=True),
        sa.Column('capacity_note', sa.Text(), nullable=True),
        sa.Column('city', sa.String(120), nullable=True),
        sa.Column('province', sa.String(2), nullable=False),
        sa.Column('regions', sa.Text(), nullable=True),
        sa.Column('agency_ban_phase', sa.String(10), nullable=False, server_default='none'),
        sa.Column('language', sa.String(2), nullable=False, server_default='fr'),
        sa.Column('website', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(60), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('contact_name', sa.String(160), nullable=True),
        sa.Column('contact_title', sa.String(160), nullable=True),
        sa.Column('hiring_signal', sa.Boolean(), nullable=True),
        sa.Column('score', sa.SmallInteger(), nullable=True),
        sa.Column('wave', sa.String(1), nullable=True),
        sa.Column('status', lead_status, nullable=False, server_default='new'),
        sa.Column('lost_reason', sa.Text(), nullable=True),
        sa.Column('source', sa.String(40), nullable=False, server_default='research'),
        sa.Column('source_detail', sa.String(255), nullable=True),
        sa.Column('next_action', sa.Text(), nullable=True),
        sa.Column('next_action_at', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('source_url', sa.Text(), nullable=True),
        sa.Column('tenant_id', uuid, sa.ForeignKey('tenants.id', ondelete='SET NULL'),
                  nullable=True, unique=True),
        sa.Column('converted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', uuid, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint('site_count IS NULL OR site_count >= 0', name='ck_platform_leads_site_count'),
        sa.CheckConstraint('score IS NULL OR score BETWEEN 0 AND 10', name='ck_platform_leads_score'),
    )
    op.create_index('ix_platform_leads_status', 'platform_leads', ['status'])
    op.create_index('ix_platform_leads_segment', 'platform_leads', ['segment'])
    op.create_index(
        'ix_platform_leads_next_action_open', 'platform_leads', ['next_action_at'],
        postgresql_where=sa.text("status NOT IN ('won', 'lost')"),
    )

    op.create_table(
        'platform_lead_events',
        sa.Column('id', uuid, primary_key=True),
        sa.Column('lead_id', uuid, sa.ForeignKey('platform_leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('from_status', lead_status, nullable=True),
        sa.Column('to_status', lead_status, nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('actor_id', uuid, sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        'ix_platform_lead_events_lead_created', 'platform_lead_events',
        ['lead_id', sa.text('created_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_platform_lead_events_lead_created', table_name='platform_lead_events')
    op.drop_table('platform_lead_events')
    op.drop_index('ix_platform_leads_next_action_open', table_name='platform_leads')
    op.drop_index('ix_platform_leads_segment', table_name='platform_leads')
    op.drop_index('ix_platform_leads_status', table_name='platform_leads')
    op.drop_table('platform_leads')
    lead_status.drop(op.get_bind(), checkfirst=True)
