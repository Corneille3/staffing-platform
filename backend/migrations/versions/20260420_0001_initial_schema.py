"""Initial schema

Revision ID: 20260420_0001
Revises: None
Create Date: 2026-04-20 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260420_0001'
down_revision = None
branch_labels = None
depends_on = None


user_role = postgresql.ENUM('apf_admin', 'org_admin', 'worker', name='user_role', create_type=False)
organization_type = postgresql.ENUM('family_daycare', 'school_based_service', 'community_centre', name='organization_type', create_type=False)
request_type = postgresql.ENUM('urgent_replacement', 'planned_replacement', 'open_staffing_need', name='request_type', create_type=False)
request_status = postgresql.ENUM('draft', 'open', 'notified', 'responses_received', 'assigned', 'completed', 'cancelled', 'expired', name='request_status', create_type=False)
response_status = postgresql.ENUM('notified', 'viewed', 'accepted', 'declined', 'withdrawn', 'no_response', name='response_status', create_type=False)
assignment_status = postgresql.ENUM('pending_confirmation', 'confirmed', 'cancelled', 'completed', name='assignment_status', create_type=False)
availability_status = postgresql.ENUM('available', 'unavailable', name='availability_status', create_type=False)
notification_channel = postgresql.ENUM('email', 'in_app', 'sms', name='notification_channel', create_type=False)
request_requirement_type = postgresql.ENUM('qualification', 'certification', name='request_requirement_type', create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    organization_type.create(bind, checkfirst=True)
    request_type.create(bind, checkfirst=True)
    request_status.create(bind, checkfirst=True)
    response_status.create(bind, checkfirst=True)
    assignment_status.create(bind, checkfirst=True)
    availability_status.create(bind, checkfirst=True)
    notification_channel.create(bind, checkfirst=True)
    request_requirement_type.create(bind, checkfirst=True)

    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', organization_type, nullable=False),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('region', sa.String(length=100), nullable=True),
        sa.Column('address_line1', sa.String(length=255), nullable=True),
        sa.Column('address_line2', sa.String(length=255), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=True),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('preferred_language', sa.String(length=5), nullable=False, server_default='fr'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )

    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('clerk_user_id', sa.String(length=255), nullable=True, unique=True),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('role', user_role, nullable=False),
        sa.Column('preferred_language', sa.String(length=5), nullable=False, server_default='fr'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )

    op.create_table(
        'organization_memberships',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', user_role, nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('user_id', 'organization_id', name='uq_user_organization_membership'),
    )

    op.create_table(
        'worker_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('availability_status', availability_status, nullable=False, server_default='available'),
        sa.Column('urgent_alert_opt_in', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('travel_radius_km', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )

    op.create_table(
        'worker_regions',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('worker_profile_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('worker_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('region', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('worker_profile_id', 'city', 'region', name='uq_worker_region_profile_city_region'),
    )

    op.create_table(
        'worker_qualifications',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('worker_profile_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('worker_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('qualification_code', sa.String(length=100), nullable=False),
        sa.Column('qualification_label', sa.String(length=255), nullable=True),
        sa.Column('expires_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('worker_profile_id', 'qualification_code', name='uq_worker_qualification_profile_code'),
    )

    op.create_table(
        'worker_certifications',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('worker_profile_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('worker_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('certification_code', sa.String(length=100), nullable=False),
        sa.Column('certification_label', sa.String(length=255), nullable=True),
        sa.Column('expires_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('worker_profile_id', 'certification_code', name='uq_worker_certification_profile_code'),
    )

    op.create_table(
        'staffing_requests',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('organizations.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_by_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('request_type', request_type, nullable=False),
        sa.Column('status', request_status, nullable=False, server_default='draft'),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('location_name', sa.String(length=255), nullable=True),
        sa.Column('work_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('urgency_level', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('language_requirement', sa.String(length=20), nullable=True, server_default='fr'),
        sa.Column('assigned_worker_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('assigned_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )

    op.create_table(
        'request_requirements',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('staffing_request_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('staffing_requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requirement_type', request_requirement_type, nullable=False),
        sa.Column('requirement_code', sa.String(length=100), nullable=False),
        sa.Column('requirement_label', sa.String(length=255), nullable=True),
        sa.Column('is_required', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint(
            'staffing_request_id',
            'requirement_type',
            'requirement_code',
            name='uq_request_requirement_request_type_code',
        ),
    )

    op.create_table(
        'request_notifications',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('staffing_request_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('staffing_requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('worker_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('channel', notification_channel, nullable=False),
        sa.Column('delivery_status', sa.String(length=50), nullable=False, server_default='queued'),
        sa.Column('sent_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )

    op.create_table(
        'request_responses',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('staffing_request_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('staffing_requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('worker_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', response_status, nullable=False),
        sa.Column('responded_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('staffing_request_id', 'worker_user_id', name='uq_request_response_request_worker'),
    )

    op.create_table(
        'assignments',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('staffing_request_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('staffing_requests.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('worker_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('assigned_by_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', assignment_status, nullable=False, server_default='pending_confirmation'),
        sa.Column('assigned_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('confirmed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('actor_user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('entity_type', sa.String(length=100), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )

    op.create_index('idx_users_role', 'users', ['role'])
    op.create_index('idx_org_memberships_org_id', 'organization_memberships', ['organization_id'])
    op.create_index('idx_worker_profiles_availability', 'worker_profiles', ['availability_status'])
    op.create_index('idx_worker_regions_city_region', 'worker_regions', ['city', 'region'])
    op.create_index('idx_worker_qualifications_code', 'worker_qualifications', ['qualification_code'])
    op.create_index('idx_worker_certifications_code', 'worker_certifications', ['certification_code'])
    op.create_index('idx_staffing_requests_org_id', 'staffing_requests', ['organization_id'])
    op.create_index('idx_staffing_requests_status', 'staffing_requests', ['status'])
    op.create_index('idx_staffing_requests_work_date', 'staffing_requests', ['work_date'])
    op.create_index('idx_request_requirements_request_id', 'request_requirements', ['staffing_request_id'])
    op.create_index('idx_request_requirements_type_code', 'request_requirements', ['requirement_type', 'requirement_code'])
    op.create_index('idx_request_responses_request_id', 'request_responses', ['staffing_request_id'])
    op.create_index('idx_request_notifications_request_id', 'request_notifications', ['staffing_request_id'])
    op.create_index('idx_audit_logs_org_created_at', 'audit_logs', ['organization_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('idx_audit_logs_org_created_at', table_name='audit_logs')
    op.drop_index('idx_request_notifications_request_id', table_name='request_notifications')
    op.drop_index('idx_request_responses_request_id', table_name='request_responses')
    op.drop_index('idx_request_requirements_type_code', table_name='request_requirements')
    op.drop_index('idx_request_requirements_request_id', table_name='request_requirements')
    op.drop_index('idx_staffing_requests_work_date', table_name='staffing_requests')
    op.drop_index('idx_staffing_requests_status', table_name='staffing_requests')
    op.drop_index('idx_staffing_requests_org_id', table_name='staffing_requests')
    op.drop_index('idx_worker_certifications_code', table_name='worker_certifications')
    op.drop_index('idx_worker_qualifications_code', table_name='worker_qualifications')
    op.drop_index('idx_worker_regions_city_region', table_name='worker_regions')
    op.drop_index('idx_worker_profiles_availability', table_name='worker_profiles')
    op.drop_index('idx_org_memberships_org_id', table_name='organization_memberships')
    op.drop_index('idx_users_role', table_name='users')

    op.drop_table('audit_logs')
    op.drop_table('assignments')
    op.drop_table('request_responses')
    op.drop_table('request_notifications')
    op.drop_table('request_requirements')
    op.drop_table('staffing_requests')
    op.drop_table('worker_certifications')
    op.drop_table('worker_qualifications')
    op.drop_table('worker_regions')
    op.drop_table('worker_profiles')
    op.drop_table('organization_memberships')
    op.drop_table('users')
    op.drop_table('organizations')

    bind = op.get_bind()
    request_requirement_type.drop(bind, checkfirst=True)
    notification_channel.drop(bind, checkfirst=True)
    availability_status.drop(bind, checkfirst=True)
    assignment_status.drop(bind, checkfirst=True)
    response_status.drop(bind, checkfirst=True)
    request_status.drop(bind, checkfirst=True)
    request_type.drop(bind, checkfirst=True)
    organization_type.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)
