from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import app.models  # noqa: F401

from app.db.session import SessionLocal
from app.models.assignment import Assignment
from app.models.availability import Availability
from app.models.enums import (
    AssignmentStatus,
    AvailabilityStatus,
    CoverageType,
    OrganizationType,
    RequestRequirementType,
    RequestRole,
    RequestStatus,
    RequestType,
    ResponseStatus,
    SlotPeriod,
    UserRole,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.request_requirement import RequestRequirement
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_certification import WorkerCertification
from app.models.worker_profile import WorkerProfile
from app.models.worker_qualification import WorkerQualification
from app.models.worker_region import WorkerRegion
from app.schemas.assignment import AssignmentCreate
from app.services.assignment_service import AssignmentService
from app.services.response_service import ResponseService
from app.services.staffing_request_service import StaffingRequestService
from app.services.worker_service import WorkerService


def _admin_scope(user: User, tenant: Tenant) -> SimpleNamespace:
    """Minimal AccessScope-compatible duck for seed-time service calls.

    The services we invoke (publish, assign, cancel, set_status) only touch a
    handful of scope properties. We mimic those without spinning up the full
    FastAPI dependency.
    """
    return SimpleNamespace(
        user=user,
        tenant_id=tenant.id,
        org_ids=[],
        is_platform_admin=False,
        is_network_admin=True,
        is_org_admin=False,
        is_worker=False,
    )


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(User).first():
            print('Seed skipped: users already exist')
            return

        tenant = Tenant(
            id=uuid4(),
            name='APF Network',
            slug='apf-network',
        )
        db.add(tenant)
        db.flush()

        organization = Organization(
            id=uuid4(),
            tenant_id=tenant.id,
            name='Les Petits Lutins',
            type=OrganizationType.CHILDCARE,
            city='Montréal',
            neighbourhood='Plateau',
            region='Québec',
            latitude=Decimal('45.5230'),
            longitude=Decimal('-73.5810'),
            contact_email='lespetitslutins@example.org',
            contact_phone='514-555-0142',
        )
        organization_two = Organization(
            id=uuid4(),
            tenant_id=tenant.id,
            name='Garderie Les Étoiles',
            type=OrganizationType.CHILDCARE,
            city='Laval',
            neighbourhood='Chomedey',
            region='Québec',
            latitude=Decimal('45.5710'),
            longitude=Decimal('-73.7330'),
            contact_email='lesetoiles@example.org',
            contact_phone='450-555-0190',
        )
        network_admin = User(
            id=uuid4(),
            clerk_user_id='dev-network-admin',
            first_name='Alice',
            last_name='Admin',
            email='alice.admin@example.org',
            role=UserRole.NETWORK_ADMIN,
        )
        org_admin = User(
            id=uuid4(),
            clerk_user_id='dev-org-admin',
            first_name='Olivia',
            last_name='Operator',
            email='olivia.operator@example.org',
            role=UserRole.ORG_ADMIN,
        )
        worker_one = User(
            id=uuid4(),
            clerk_user_id='dev-worker-wendy',
            first_name='Wendy',
            last_name='Worker',
            email='wendy.worker@example.org',
            role=UserRole.WORKER,
        )
        worker_two = User(
            id=uuid4(),
            clerk_user_id='dev-worker-bruno',
            first_name='Bruno',
            last_name='Bilingual',
            email='bruno.worker@example.org',
            role=UserRole.WORKER,
            preferred_language='fr',
        )
        # Invited but not onboarded — exercises the onboarding flow.
        worker_three = User(
            id=uuid4(),
            clerk_user_id='dev-worker-nora',
            first_name='Nora',
            last_name='NewHire',
            email='nora.worker@example.org',
            role=UserRole.WORKER,
        )
        worker_four = User(
            id=uuid4(),
            clerk_user_id='dev-worker-owen',
            first_name='Owen',
            last_name='Onboarding',
            email='owen.worker@example.org',
            role=UserRole.WORKER,
        )

        db.add_all([
            organization, organization_two,
            network_admin, org_admin, worker_one, worker_two, worker_three, worker_four,
        ])
        db.flush()

        db.add(TenantMembership(
            id=uuid4(), user_id=network_admin.id, tenant_id=tenant.id, role=UserRole.NETWORK_ADMIN,
        ))
        db.add(TenantMembership(
            id=uuid4(), user_id=org_admin.id, tenant_id=tenant.id, role=UserRole.ORG_ADMIN,
        ))
        # Olivia (org_admin) is a coordinator for both orgs.
        db.add(OrganizationMembership(
            id=uuid4(), user_id=org_admin.id, organization_id=organization.id, role=UserRole.ORG_ADMIN,
        ))
        db.add(OrganizationMembership(
            id=uuid4(), user_id=org_admin.id, organization_id=organization_two.id, role=UserRole.ORG_ADMIN,
        ))
        for worker in (worker_one, worker_two, worker_three, worker_four):
            db.add(TenantMembership(
                id=uuid4(), user_id=worker.id, tenant_id=tenant.id, role=UserRole.WORKER,
            ))

        worker_one_profile = WorkerProfile(
            id=uuid4(),
            user_id=worker_one.id,
            availability_status=AvailabilityStatus.AVAILABLE,
            home_latitude=Decimal('45.5180'),
            home_longitude=Decimal('-73.5710'),
            travel_radius_km=15,
        )
        worker_one_profile.region_records = [
            WorkerRegion(id=uuid4(), city='Montréal', region='Québec'),
        ]
        worker_one_profile.qualification_records = [
            WorkerQualification(id=uuid4(), qualification_code='ECE_LEVEL_1', qualification_label='ECE Level 1'),
        ]
        worker_one_profile.certification_records = [
            WorkerCertification(id=uuid4(), certification_code='FIRST_AID', certification_label='First Aid'),
        ]

        worker_two_profile = WorkerProfile(
            id=uuid4(),
            user_id=worker_two.id,
            availability_status=AvailabilityStatus.AVAILABLE,
            home_latitude=Decimal('45.5365'),
            home_longitude=Decimal('-73.5890'),
            travel_radius_km=20,
            notify_far=True,
        )
        worker_two_profile.region_records = [
            WorkerRegion(id=uuid4(), city='Montréal', region='Québec'),
            WorkerRegion(id=uuid4(), city='Laval', region='Québec'),
        ]
        worker_two_profile.qualification_records = [
            WorkerQualification(id=uuid4(), qualification_code='ECE_LEVEL_1', qualification_label='ECE Level 1'),
            WorkerQualification(id=uuid4(), qualification_code='ECE_LEVEL_2', qualification_label='ECE Level 2'),
        ]
        worker_two_profile.certification_records = [
            WorkerCertification(id=uuid4(), certification_code='FIRST_AID', certification_label='First Aid'),
        ]

        db.add_all([worker_one_profile, worker_two_profile])

        # Seed availability grid: this week's Mon–Fri (mornings + afternoons)
        # AND next week's Mon–Fri, so that lifecycle requests anchored to
        # 'next Monday' always land in a slot the matching engine can see —
        # otherwise the seed produces an empty notified list when run on a
        # weekend (matching rejects "Slot not in weekly grid").
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        next_week_start = week_start + timedelta(days=7)
        for worker in (worker_one, worker_two):
            for base in (week_start, next_week_start):
                for offset in range(0, 5):  # Mon through Fri
                    shift_date = base + timedelta(days=offset)
                    for slot in (SlotPeriod.MORNING, SlotPeriod.AFTERNOON):
                        db.add(Availability(
                            id=uuid4(),
                            user_id=worker.id,
                            specific_date=shift_date,
                            slot=slot,
                            available=True,
                        ))

        # Anchor demo requests to next Monday so they always fall on a weekday
        # the workers can cover (otherwise running the seed on a Saturday or
        # Sunday produces an empty notified pool).
        next_monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)

        staffing_request = StaffingRequest(
            id=uuid4(),
            organization_id=organization.id,
            created_by_user_id=org_admin.id,
            request_type=RequestType.URGENT_REPLACEMENT,
            role=RequestRole.EDUCATOR,
            status=RequestStatus.DRAFT,
            title='Educator replacement - morning shift',
            description='Need coverage for preschool group.',
            city='Montréal',
            location_name='Site A - Preschool room',
            work_date=next_monday,
            start_time=time(hour=8),
            end_time=time(hour=12),
            urgency_level=3,
            language_requirement='fr',
            coverage_type=CoverageType.SAME_DAY_URGENT,
            hourly_rate=Decimal('26.00'),
            contact_name='Marie-Claude Bergeron',
            contact_phone='514-555-0147',
            contact_email='mc.bergeron@example.org',
            arrival_instructions='Enter through the side door on Rue des Érables. Sign in at the front desk and ask for Marie-Claude.',
        )
        staffing_request.requirements = [
            RequestRequirement(
                id=uuid4(),
                requirement_type=RequestRequirementType.QUALIFICATION,
                requirement_code='ECE_LEVEL_1',
                requirement_label='ECE Level 1',
            ),
            RequestRequirement(
                id=uuid4(),
                requirement_type=RequestRequirementType.CERTIFICATION,
                requirement_code='FIRST_AID',
                requirement_label='First Aid',
            ),
        ]
        db.add(staffing_request)

        # Request 2 — notified: appears in worker inbox, no response yet
        notified_request = StaffingRequest(
            id=uuid4(),
            organization_id=organization.id,
            created_by_user_id=org_admin.id,
            request_type=RequestType.URGENT_REPLACEMENT,
            role=RequestRole.EDUCATOR,
            status=RequestStatus.NOTIFIED,
            title='Afternoon educator needed — Toddler room',
            description='Need coverage for toddler group, afternoon shift.',
            city='Montréal',
            location_name='Site B - Toddler room',
            work_date=next_monday + timedelta(days=1),
            start_time=time(hour=13),
            end_time=time(hour=17),
            urgency_level=2,
            language_requirement='fr',
            coverage_type=CoverageType.SAME_DAY_URGENT,
            hourly_rate=Decimal('26.00'),
            contact_name='Marie-Claude Bergeron',
            contact_phone='514-555-0147',
            contact_email='mc.bergeron@example.org',
            arrival_instructions='Enter through the side door on Rue des Érables. Sign in at the front desk and ask for Marie-Claude.',
        )
        notified_request.requirements = [
            RequestRequirement(
                id=uuid4(),
                requirement_type=RequestRequirementType.QUALIFICATION,
                requirement_code='ECE_LEVEL_1',
                requirement_label='ECE Level 1',
            ),
        ]
        db.add(notified_request)
        db.flush()

        # Seed response rows for both workers on the notified request
        # (the notify endpoint creates these in production)
        for worker in (worker_one, worker_two):
            db.add(RequestResponse(
                id=uuid4(),
                staffing_request_id=notified_request.id,
                worker_user_id=worker.id,
                status=ResponseStatus.NOTIFIED,
            ))

        db.flush()

        # ── Lifecycle the draft request: publish → accept (Wendy) → assign → complete.
        # Using the service layer so each transition logs the right audit event,
        # which gives the APF activity feed real content from t=0.
        coordinator_scope = _admin_scope(org_admin, tenant)
        request_service = StaffingRequestService(db)
        response_service = ResponseService(db)
        assignment_service = AssignmentService(db)
        audit_service = request_service.audit_service  # share so we keep one session

        published = request_service.publish(staffing_request.id)
        response_service.set_status(
            request_id=published.id,
            worker_user_id=worker_one.id,
            response_status=ResponseStatus.ACCEPTED,
        )
        assignment = assignment_service.assign(AssignmentCreate(
            staffing_request_id=published.id,
            worker_user_id=worker_one.id,
            assigned_by_user_id=org_admin.id,
            notes='Auto-assigned from seed',
        ))

        # Manually complete the assignment (no completion endpoint exists yet
        # in v2; the activity feed + dashboard need ≥1 completed shift to
        # populate KPIs and recent-closed panel).
        now = datetime.now(timezone.utc)
        assignment.status = AssignmentStatus.COMPLETED
        assignment.completed_at = now
        published.status = RequestStatus.COMPLETED
        published.completed_at = now
        audit_service.log(
            action='staffing_request.completed',
            entity_type='staffing_request',
            entity_id=published.id,
            actor_user_id=org_admin.id,
            organization_id=published.organization_id,
        )
        db.commit()

        # ── Bruno declines the notified-request with a reason.
        # Powers the M4 sand-tinted decline-pattern callout on /admin/requests/[id].
        response_service.set_status(
            request_id=notified_request.id,
            worker_user_id=worker_two.id,
            response_status=ResponseStatus.DECLINED,
            decline_reason='Family obligation',
        )

        # ── A third request that gets cancelled, for activity-feed variety.
        cancelled_request = StaffingRequest(
            id=uuid4(),
            organization_id=organization_two.id,
            created_by_user_id=org_admin.id,
            request_type=RequestType.URGENT_REPLACEMENT,
            role=RequestRole.EDUCATOR,
            status=RequestStatus.DRAFT,
            title='Substitute educator — Laval (cancelled)',
            description='Coverage need cancelled by on-site team.',
            city='Laval',
            location_name='Garderie Les Étoiles · main room',
            work_date=next_monday + timedelta(days=2),
            start_time=time(hour=9),
            end_time=time(hour=15),
            urgency_level=2,
            language_requirement='fr',
            coverage_type=CoverageType.PLANNED_ABSENCE,
            hourly_rate=Decimal('26.00'),
        )
        cancelled_request.requirements = [
            RequestRequirement(
                id=uuid4(),
                requirement_type=RequestRequirementType.QUALIFICATION,
                requirement_code='ECE_LEVEL_1',
                requirement_label='ECE Level 1',
            ),
        ]
        db.add(cancelled_request)
        db.flush()
        request_service.cancel(cancelled_request.id)

        # ── Refresh the reliability cache so /apf/substitutes top-contributors
        # shows non-zero bars based on Wendy's completed shift.
        WorkerService(db).recompute_reliability_all()

        db.commit()
        # Touch coordinator_scope to satisfy linters — the scope is constructed
        # for parity with how services are called in the API layer, even though
        # the seed-time service methods we use don't accept a scope argument.
        _ = coordinator_scope
        print('Seeded development data')
    finally:
        db.close()


if __name__ == '__main__':
    seed()
