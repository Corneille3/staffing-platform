from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import AvailabilityStatus, UserRole
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_certification import WorkerCertification
from app.models.worker_profile import WorkerProfile
from app.models.worker_qualification import WorkerQualification
from app.models.worker_region import WorkerRegion
from app.repositories.worker_repository import WorkerRepository
from app.schemas.worker import WorkerInviteCreate, WorkerOnboardCreate
from app.services.audit_service import AuditService


class WorkerService:
    def __init__(self, db: Session) -> None:
        self.repository = WorkerRepository(db)
        self.audit_service = AuditService(db)
        self.db = db

    def list(self) -> list[User]:
        return self.repository.list()

    def list_for_scope(self, scope: AccessScope) -> list[User]:
        return self.repository.list_for_scope(scope)

    def get(self, user_id: UUID) -> User | None:
        return self.repository.get(user_id)

    def invite(self, payload: WorkerInviteCreate, scope: AccessScope) -> User:
        tenant_id = scope.tenant_id
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='No tenant associated with your account.',
            )

        existing = self.db.scalar(select(User).where(User.email == payload.email))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='A user with that email already exists.',
            )

        user = User(
            id=uuid4(),
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=payload.phone,
            role=UserRole.WORKER,
            preferred_language=payload.preferred_language,
        )
        self.db.add(user)
        self.db.flush()

        self.db.add(TenantMembership(
            id=uuid4(),
            user_id=user.id,
            tenant_id=tenant_id,
            role=UserRole.WORKER,
        ))

        self.audit_service.log(
            action='worker.invited',
            entity_type='user',
            entity_id=user.id,
            actor_user_id=scope.user.id,
            payload={'email': payload.email, 'tenant_id': str(tenant_id)},
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def onboard(self, worker_user_id: UUID, payload: WorkerOnboardCreate) -> WorkerProfile:
        existing = self.repository.get_profile(worker_user_id)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Worker profile already exists. Use the availability endpoint to update it.',
            )

        profile = WorkerProfile(
            id=uuid4(),
            user_id=worker_user_id,
            availability_status=payload.availability_status,
            urgent_alert_opt_in=payload.urgent_alert_opt_in,
        )
        self.db.add(profile)
        self.db.flush()

        for city in payload.supported_cities:
            if city.strip():
                self.db.add(WorkerRegion(
                    id=uuid4(), worker_profile_id=profile.id, city=city.strip(),
                ))

        for code in payload.qualifications:
            if code.strip():
                self.db.add(WorkerQualification(
                    id=uuid4(), worker_profile_id=profile.id, qualification_code=code.strip(),
                ))

        for code in payload.certifications:
            if code.strip():
                self.db.add(WorkerCertification(
                    id=uuid4(), worker_profile_id=profile.id, certification_code=code.strip(),
                ))

        self.audit_service.log(
            action='worker.onboarded',
            entity_type='worker_profile',
            entity_id=profile.id,
            actor_user_id=worker_user_id,
            payload={
                'cities': payload.supported_cities,
                'qualifications': payload.qualifications,
                'certifications': payload.certifications,
            },
        )
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def update_availability(
        self,
        user_id: UUID,
        availability_status: AvailabilityStatus | None = None,
        urgent_alert_opt_in: bool | None = None,
        supported_cities: list[str] | None = None,
    ) -> WorkerProfile | None:
        profile = self.repository.get_profile(user_id)
        if profile is None:
            return None

        payload: dict[str, object] = {}
        if availability_status is not None:
            profile.availability_status = availability_status
            payload['availability_status'] = availability_status.value
        if urgent_alert_opt_in is not None:
            profile.urgent_alert_opt_in = urgent_alert_opt_in
            payload['urgent_alert_opt_in'] = urgent_alert_opt_in
        if supported_cities is not None:
            profile.region_records.clear()
            profile.region_records.extend(
                WorkerRegion(id=uuid4(), worker_profile_id=profile.id, city=city.strip(), region=None)
                for city in supported_cities
                if city.strip()
            )
            payload['supported_cities'] = supported_cities

        saved = self.repository.save(profile)
        self.audit_service.log(
            action='worker.availability_updated',
            entity_type='worker_profile',
            entity_id=saved.id,
            actor_user_id=user_id,
            payload=payload,
        )
        self.db.commit()
        return saved
