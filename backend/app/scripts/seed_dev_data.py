from datetime import date, time, timedelta
from decimal import Decimal
from uuid import uuid4

import app.models  # noqa: F401

from app.db.session import SessionLocal
from app.models.availability import Availability
from app.models.enums import (
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

        db.add_all([organization, network_admin, org_admin, worker_one, worker_two])
        db.flush()

        db.add(TenantMembership(
            id=uuid4(), user_id=network_admin.id, tenant_id=tenant.id, role=UserRole.NETWORK_ADMIN,
        ))
        db.add(TenantMembership(
            id=uuid4(), user_id=org_admin.id, tenant_id=tenant.id, role=UserRole.ORG_ADMIN,
        ))
        db.add(OrganizationMembership(
            id=uuid4(), user_id=org_admin.id, organization_id=organization.id, role=UserRole.ORG_ADMIN,
        ))
        for worker in (worker_one, worker_two):
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

        # Seed availability grid for the current week (Mon–Fri morning + afternoon)
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        for worker in (worker_one, worker_two):
            for offset in range(0, 5):  # Mon through Fri
                shift_date = week_start + timedelta(days=offset)
                for slot in (SlotPeriod.MORNING, SlotPeriod.AFTERNOON):
                    db.add(Availability(
                        id=uuid4(),
                        user_id=worker.id,
                        specific_date=shift_date,
                        slot=slot,
                        available=True,
                    ))

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
            work_date=date.today(),
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
        tomorrow = date.today() + timedelta(days=1)
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
            work_date=tomorrow,
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

        db.commit()
        print('Seeded development data')
    finally:
        db.close()


if __name__ == '__main__':
    seed()
