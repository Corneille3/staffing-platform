from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.config import settings
from app.models.assignment import Assignment
from app.models.enums import AvailabilityStatus, UserRole
from app.models.request_response import RequestResponse
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_certification import WorkerCertification
from app.models.worker_profile import WorkerProfile
from app.models.worker_qualification import WorkerQualification
from app.models.worker_region import WorkerRegion
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.repositories.worker_repository import WorkerRepository
from app.schemas.worker import WorkerInviteCreate, WorkerOnboardCreate
from app.services.audit_service import AuditService


class WorkerService:
    def __init__(self, db: Session) -> None:
        self.repository = WorkerRepository(db)
        self.audit_service = AuditService(db)
        self.email = EmailNotificationService()
        self.db = db

    def _portal_url(self) -> str:
        if settings.allowed_origins:
            return settings.allowed_origins[0].rstrip('/')
        return 'http://localhost:3000'

    def _send_invite_email(self, user: User) -> None:
        portal_url = self._portal_url()
        signup_url = f'{portal_url}/sign-up?email_address={quote(user.email)}'
        fr = (
            f'Bonjour {user.first_name},\n\n'
            f'Vous avez été invité(e) à rejoindre le bassin de remplaçant(e)s Staffig.\n\n'
            f'Créez votre compte Staffig avec cette adresse courriel :\n'
            f'{signup_url}\n\n'
            f'Après votre inscription, vous serez invité(e) à compléter votre profil.\n'
        )
        en = (
            f'Hello {user.first_name},\n\n'
            f'You have been invited to join the Staffig substitute pool.\n\n'
            f'Create your Staffig account with this email address:\n'
            f'{signup_url}\n\n'
            f'After you sign up, you will be prompted to complete your profile.\n'
        )
        subject = localized_subject(
            user.preferred_language,
            '[Staffig] Invitation à rejoindre le bassin de remplaçant(e)s',
            '[Staffig] Invitation to join the substitute pool',
        )
        body = localized(user.preferred_language, fr, en)
        self.email.send(EmailMessage(to_email=user.email, subject=subject, body=body))

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

        # GUARD (MULTITENANCY_HANDOFF §2.5): rejecting an existing email also
        # prevents the one-person-in-two-tenants state. The spec eventually wants
        # a substitute in two tenants = one users row + two tenant_memberships,
        # but our worker inbox query isn't yet tenant-scoped (it would MIX both
        # tenants' requests — see StaffingRequestRepository.list_for_scope). Until
        # the per-tenant worker routing lands, we keep multi-tenant substitutes
        # unreachable: you can't reuse an existing identity to add a 2nd tenant.
        existing = self.db.scalar(select(User).where(User.email == payload.email))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='A user with that email already exists. A substitute can '
                       'belong to only one network for now.',
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
            employment_type=payload.employment_type,
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
        try:
            self._send_invite_email(user)
        except Exception:
            # Invitation creation is the primary action; email delivery is best-effort.
            pass
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

        if payload.preferred_language:
            user = self.db.get(User, worker_user_id)
            if user is not None and payload.preferred_language in {'fr', 'en', 'bilingual'}:
                user.preferred_language = payload.preferred_language
                self.db.add(user)

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

    def recompute_reliability_for(self, worker_user_id: UUID) -> int:
        """Recompute the cached reliability score for a single worker.

        Spec formula (NETWORK_HANDOFF.md §8) is
        ``(accepted + completed) / notifications_viewed_within_60min``
        over a 90-day window, but our schema doesn't yet record
        ``viewed_at``/``notified_at`` per response (TODO: backfill in a
        later slice). For v2 we use the closest available proxy:
        decisive responses (accepted+declined+completed+cancelled
        assignments) — and score as a percentage of accepted/completed.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)

        accepted = self.db.scalar(
            select(func.count()).select_from(RequestResponse).where(
                RequestResponse.worker_user_id == worker_user_id,
                RequestResponse.status == 'accepted',
                RequestResponse.created_at >= cutoff,
            )
        ) or 0
        declined = self.db.scalar(
            select(func.count()).select_from(RequestResponse).where(
                RequestResponse.worker_user_id == worker_user_id,
                RequestResponse.status.in_(['declined', 'withdrawn']),
                RequestResponse.created_at >= cutoff,
            )
        ) or 0
        completed = self.db.scalar(
            select(func.count()).select_from(Assignment).where(
                Assignment.worker_user_id == worker_user_id,
                Assignment.status == 'completed',
                Assignment.assigned_at >= cutoff,
            )
        ) or 0
        cancelled = self.db.scalar(
            select(func.count()).select_from(Assignment).where(
                Assignment.worker_user_id == worker_user_id,
                Assignment.status == 'cancelled',
                Assignment.assigned_at >= cutoff,
            )
        ) or 0

        decisive = accepted + declined + completed + cancelled
        score = 0 if decisive == 0 else round(((accepted + completed) / decisive) * 100)
        score = max(0, min(100, score))

        profile = self.repository.get_profile(worker_user_id)
        if profile is not None:
            profile.reliability = score
            self.db.add(profile)
            self.db.commit()
        return score

    def recompute_reliability_all(self) -> int:
        """Recompute reliability for every worker profile in the DB.

        Intended for a nightly cron once we have one. Until then, the APF
        admin can hit ``POST /api/v1/apf/substitutes/recompute-reliability``
        to refresh manually.
        """
        worker_ids = list(self.db.scalars(select(WorkerProfile.user_id)).all())
        for user_id in worker_ids:
            self.recompute_reliability_for(user_id)
        return len(worker_ids)

    def set_sms_opt_out(self, user_id: UUID, opt_out: bool) -> User | None:
        """Silence (or re-enable) texts for one person.

        Deliberately keyed on the user row rather than the worker profile:
        the inbound STOP/ARRET handler resolves a bare phone number to a
        User and has no profile to lean on, and a worker who was invited but
        never onboarded still has a phone we must be able to stop texting.
        """
        user = self.repository.get(user_id)
        if user is None:
            return None

        user.sms_opt_out = opt_out
        self.audit_service.log(
            action='worker.sms_opt_out_updated',
            entity_type='user',
            entity_id=user.id,
            actor_user_id=user_id,
            payload={'sms_opt_out': opt_out},
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_availability(
        self,
        user_id: UUID,
        availability_status: AvailabilityStatus | None = None,
        urgent_alert_opt_in: bool | None = None,
        notify_far: bool | None = None,
        notify_weekend_overnight: bool | None = None,
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
        if notify_far is not None:
            profile.notify_far = notify_far
            payload['notify_far'] = notify_far
        if notify_weekend_overnight is not None:
            profile.notify_weekend_overnight = notify_weekend_overnight
            payload['notify_weekend_overnight'] = notify_weekend_overnight
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
