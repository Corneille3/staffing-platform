from datetime import date, time
from uuid import uuid4

import app.models  # noqa: F401

from app.db.session import SessionLocal
from app.models.enums import AvailabilityStatus, OrganizationType, RequestStatus, RequestType, UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.models.worker_profile import WorkerProfile


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(User).first():
            print('Seed skipped: users already exist')
            return

        organization = Organization(
            id=uuid4(),
            name='APF Regina Centre',
            type=OrganizationType.COMMUNITY_CENTRE,
            city='Regina',
            region='Saskatchewan',
            contact_email='regina@example.org',
            contact_phone='306-555-0100',
        )
        apf_admin = User(
            id=uuid4(),
            first_name='Alice',
            last_name='Admin',
            email='alice.admin@example.org',
            role=UserRole.APF_ADMIN,
        )
        org_admin = User(
            id=uuid4(),
            first_name='Olivia',
            last_name='Operator',
            email='olivia.operator@example.org',
            role=UserRole.ORG_ADMIN,
        )
        worker_one = User(
            id=uuid4(),
            first_name='Wendy',
            last_name='Worker',
            email='wendy.worker@example.org',
            role=UserRole.WORKER,
        )
        worker_two = User(
            id=uuid4(),
            first_name='Bruno',
            last_name='Bilingual',
            email='bruno.worker@example.org',
            role=UserRole.WORKER,
            preferred_language='fr',
        )

        db.add_all([organization, apf_admin, org_admin, worker_one, worker_two])
        db.flush()

        db.add(
            OrganizationMembership(
                id=uuid4(),
                user_id=org_admin.id,
                organization_id=organization.id,
                role=UserRole.ORG_ADMIN,
            )
        )

        db.add_all(
            [
                WorkerProfile(
                    id=uuid4(),
                    user_id=worker_one.id,
                    availability_status=AvailabilityStatus.AVAILABLE,
                    qualifications=['ECE_LEVEL_1'],
                    certifications=['FIRST_AID'],
                    supported_cities=['Regina'],
                ),
                WorkerProfile(
                    id=uuid4(),
                    user_id=worker_two.id,
                    availability_status=AvailabilityStatus.AVAILABLE,
                    qualifications=['ECE_LEVEL_1', 'ECE_LEVEL_2'],
                    certifications=['FIRST_AID'],
                    supported_cities=['Regina', 'Saskatoon'],
                ),
            ]
        )

        db.add(
            StaffingRequest(
                id=uuid4(),
                organization_id=organization.id,
                created_by_user_id=org_admin.id,
                request_type=RequestType.URGENT_REPLACEMENT,
                status=RequestStatus.DRAFT,
                title='Educator replacement - morning shift',
                description='Need coverage for preschool group.',
                city='Regina',
                location_name='Site A - Preschool room',
                work_date=date.today(),
                start_time=time(hour=8),
                end_time=time(hour=12),
                urgency_level=3,
                language_requirement='fr',
                required_qualifications=['ECE_LEVEL_1'],
                required_certifications=['FIRST_AID'],
            )
        )
        db.commit()
        print('Seeded development data')
    finally:
        db.close()


if __name__ == '__main__':
    seed()
