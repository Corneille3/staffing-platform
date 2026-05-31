from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def _json_safe(value):
    """Convert a single field value into something `json.dumps` will accept.

    The audit log's `payload` column is JSONB; FastAPI/Pydantic happily round-trips
    ``date``/``time``/``Decimal``/Enum types through the API layer, but the raw
    SQLAlchemy insert into JSONB uses ``json.dumps`` which only knows the
    primitive set. Stringify here so any draft-update field can be audited.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, 'value'):  # Enum
        return value.value
    return str(value)

from app.auth.scope import AccessScope
from app.models.enums import NotificationChannel, RequestStatus, ResponseStatus
from app.models.enums import RequestRequirementType
from app.models.request_notification import RequestNotification
from app.models.request_requirement import RequestRequirement
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.organization import Organization
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.repositories.worker_repository import WorkerRepository
from app.schemas.staffing_request import StaffingRequestCreate, StaffingRequestDraftUpdate
from app.notifications.notification_dispatcher import NotificationDispatcher
from app.services.audit_service import AuditService
from app.services.matching_service import MatchingService


class StaffingRequestService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = StaffingRequestRepository(db)
        self.worker_repository = WorkerRepository(db)
        self.response_repository = ResponseRepository(db)
        self.audit_service = AuditService(db)
        self.matching_service = MatchingService(db=db)
        self.dispatcher = NotificationDispatcher(db)

    def list(self) -> list[StaffingRequest]:
        return self.repository.list()

    def get(self, request_id: UUID) -> StaffingRequest | None:
        return self.repository.get(request_id)

    def create(self, payload: StaffingRequestCreate, scope: AccessScope) -> StaffingRequest:
        organization = self.db.get(Organization, payload.organization_id)
        if organization is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Organization not found')
        if not self._can_create_for_organization(organization, scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')

        staffing_request = StaffingRequest(
            id=uuid4(),
            organization_id=payload.organization_id,
            created_by_user_id=scope.user.id,
            request_type=payload.request_type,
            title=payload.title,
            description=payload.description,
            city=payload.city,
            location_name=payload.location_name,
            work_date=payload.work_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            urgency_level=payload.urgency_level,
            language_requirement=payload.language_requirement,
            coverage_type=payload.coverage_type,
            contact_name=payload.contact_name,
            contact_phone=payload.contact_phone,
            contact_email=payload.contact_email,
            arrival_instructions=payload.arrival_instructions,
        )
        staffing_request.requirements = [
            *[
                RequestRequirement(
                    id=uuid4(),
                    requirement_type=RequestRequirementType.QUALIFICATION,
                    requirement_code=self._requirement_code(item),
                    requirement_label=self._requirement_label(item),
                )
                for item in payload.required_qualifications
            ],
            *[
                RequestRequirement(
                    id=uuid4(),
                    requirement_type=RequestRequirementType.CERTIFICATION,
                    requirement_code=self._requirement_code(item),
                    requirement_label=self._requirement_label(item),
                )
                for item in payload.required_certifications
            ],
        ]
        created = self.repository.create(staffing_request)
        self.audit_service.log(
            action='staffing_request.created',
            entity_type='staffing_request',
            entity_id=created.id,
            actor_user_id=created.created_by_user_id,
            organization_id=created.organization_id,
            payload={'status': created.status.value, 'title': created.title},
        )
        self.db.commit()
        return created

    # Statuses whose details a coordinator may still edit. Once a worker is
    # assigned (or the request is completed/cancelled/expired) the shift is
    # locked — editing then must go through cancel/recreate so nobody shows up
    # at a time/place that silently changed under them.
    EDITABLE_STATUSES = frozenset({
        RequestStatus.DRAFT,
        RequestStatus.OPEN,
        RequestStatus.NOTIFIED,
        RequestStatus.RESPONSES_RECEIVED,
    })

    def update_draft(
        self,
        request_id: UUID,
        payload: StaffingRequestDraftUpdate,
        scope: AccessScope,
    ) -> StaffingRequest:
        """Apply partial updates to a request that hasn't been assigned yet.

        Only fields explicitly set on the payload are touched. Drafts use this
        for create-flow autosave; published-but-pre-assigned requests use it for
        coordinator edits (E2E bug #6). Editing does NOT re-notify already-
        notified workers or reset their responses — the caller is warned in the
        UI to use the re-notify control. Once assigned/closed, this raises 409.
        """
        staffing_request = self._get_required(request_id)
        if not self.repository.can_access(staffing_request, scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
        if staffing_request.status not in self.EDITABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    'This request can no longer be edited — it has been assigned '
                    'or closed. Cancel the assignment first to change shift details.'
                ),
            )
        was_draft = staffing_request.status == RequestStatus.DRAFT

        data = payload.model_dump(exclude_unset=True)

        # Scalar fields map 1:1 onto the column names.
        scalar_fields = {
            'title', 'description', 'city', 'location_name', 'work_date',
            'start_time', 'end_time', 'urgency_level', 'language_requirement',
            'coverage_type', 'role', 'hourly_rate', 'contact_name',
            'contact_phone', 'contact_email', 'arrival_instructions',
        }
        touched = {}
        for field in scalar_fields:
            if field in data:
                setattr(staffing_request, field, data[field])
                touched[field] = _json_safe(data[field])

        # Requirements: replace wholesale per patched type. Two-phase flush
        # required because the unique constraint
        # (staffing_request_id, requirement_type, requirement_code) trips if
        # SQLAlchemy tries to insert the new rows before deleting the orphans
        # with the same composite key.
        patched_quals = 'required_qualifications' in data
        patched_certs = 'required_certifications' in data
        if patched_quals or patched_certs:
            kept = [
                r for r in staffing_request.requirements
                if (r.requirement_type == RequestRequirementType.QUALIFICATION and not patched_quals)
                or (r.requirement_type == RequestRequirementType.CERTIFICATION and not patched_certs)
            ]
            staffing_request.requirements = kept
            self.db.flush()  # Force orphan deletes BEFORE the inserts below.

            if patched_quals:
                for item in data['required_qualifications']:
                    staffing_request.requirements.append(RequestRequirement(
                        id=uuid4(),
                        requirement_type=RequestRequirementType.QUALIFICATION,
                        requirement_code=self._requirement_code(item),
                        requirement_label=self._requirement_label(item),
                    ))
                touched['required_qualifications'] = [self._requirement_code(i) for i in data['required_qualifications']]
            if patched_certs:
                for item in data['required_certifications']:
                    staffing_request.requirements.append(RequestRequirement(
                        id=uuid4(),
                        requirement_type=RequestRequirementType.CERTIFICATION,
                        requirement_code=self._requirement_code(item),
                        requirement_label=self._requirement_label(item),
                    ))
                touched['required_certifications'] = [self._requirement_code(i) for i in data['required_certifications']]

        self.db.flush()
        if touched:
            self.audit_service.log(
                action='staffing_request.draft_updated' if was_draft else 'staffing_request.updated',
                entity_type='staffing_request',
                entity_id=staffing_request.id,
                actor_user_id=scope.user.id,
                organization_id=staffing_request.organization_id,
                payload=touched,
            )
        self.db.commit()
        self.db.refresh(staffing_request)
        return staffing_request

    @staticmethod
    def _can_create_for_organization(organization: Organization, scope: AccessScope) -> bool:
        if scope.is_platform_admin or scope.is_network_admin:
            return scope.tenant_id is not None and organization.tenant_id == scope.tenant_id
        if scope.is_org_admin:
            return organization.id in scope.org_ids
        return False

    def _workers_for_request(self, staffing_request: StaffingRequest):
        org = self.db.get(Organization, staffing_request.organization_id)
        if org and org.tenant_id:
            return self.worker_repository.list_for_tenant(org.tenant_id)
        return self.worker_repository.list()

    def publish(self, request_id: UUID) -> StaffingRequest:
        staffing_request = self._get_required(request_id)
        if staffing_request.status not in {RequestStatus.DRAFT, RequestStatus.OPEN}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Request cannot be published')

        workers = self._workers_for_request(staffing_request)
        eligible_workers = self.matching_service.eligible_workers(staffing_request, workers)

        staffing_request.status = RequestStatus.NOTIFIED
        self.repository.save(staffing_request)

        for worker in eligible_workers:
            self.db.add(
                RequestNotification(
                    id=uuid4(),
                    staffing_request_id=staffing_request.id,
                    worker_user_id=worker.id,
                    channel=NotificationChannel.IN_APP,
                    delivery_status='queued',
                )
            )
            existing = self.response_repository.get_for_request_and_worker(staffing_request.id, worker.id)
            if existing is None:
                self.db.add(
                    RequestResponse(
                        id=uuid4(),
                        staffing_request_id=staffing_request.id,
                        worker_user_id=worker.id,
                        status=ResponseStatus.NOTIFIED,
                    )
                )

        self.audit_service.log(
            action='staffing_request.published',
            entity_type='staffing_request',
            entity_id=staffing_request.id,
            actor_user_id=staffing_request.created_by_user_id,
            organization_id=staffing_request.organization_id,
            payload={'eligible_worker_count': len(eligible_workers)},
        )
        self.db.commit()
        self.db.refresh(staffing_request)
        self.dispatcher.notify_workers(staffing_request, eligible_workers)
        return staffing_request

    def renotify(self, request_id: UUID, actor_user_id: UUID) -> StaffingRequest:
        staffing_request = self._get_required(request_id)
        if staffing_request.status not in {RequestStatus.RESPONSES_RECEIVED, RequestStatus.NOTIFIED, RequestStatus.OPEN}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Request cannot be re-notified in its current state.',
            )

        workers = self._workers_for_request(staffing_request)
        eligible_workers = self.matching_service.eligible_workers(staffing_request, workers)

        staffing_request.status = RequestStatus.NOTIFIED
        self.repository.save(staffing_request)

        new_notifications = 0
        for worker in eligible_workers:
            self.db.add(
                RequestNotification(
                    id=uuid4(),
                    staffing_request_id=staffing_request.id,
                    worker_user_id=worker.id,
                    channel=NotificationChannel.IN_APP,
                    delivery_status='queued',
                )
            )
            existing = self.response_repository.get_for_request_and_worker(staffing_request.id, worker.id)
            if existing is None or existing.status == ResponseStatus.DECLINED:
                if existing is not None:
                    existing.status = ResponseStatus.NOTIFIED
                    existing.responded_at = None
                    existing.decline_reason = None
                else:
                    self.db.add(
                        RequestResponse(
                            id=uuid4(),
                            staffing_request_id=staffing_request.id,
                            worker_user_id=worker.id,
                            status=ResponseStatus.NOTIFIED,
                        )
                    )
                new_notifications += 1

        self.audit_service.log(
            action='staffing_request.renotified',
            entity_type='staffing_request',
            entity_id=staffing_request.id,
            actor_user_id=actor_user_id,
            organization_id=staffing_request.organization_id,
            payload={'eligible_worker_count': len(eligible_workers), 'new_notifications': new_notifications},
        )
        self.db.commit()
        self.db.refresh(staffing_request)
        self.dispatcher.notify_workers(staffing_request, eligible_workers)
        return staffing_request

    def notify_specific(self, request_id: UUID, worker_user_ids: list[UUID], actor_user_id: UUID) -> int:
        """Add specific substitutes to a request's notification batch (the
        directory 'Notify' action). Creates a notified response row for each
        worker who isn't already an active responder. Returns the count added."""
        staffing_request = self._get_required(request_id)
        if staffing_request.status not in {RequestStatus.RESPONSES_RECEIVED, RequestStatus.NOTIFIED, RequestStatus.OPEN}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Request is not open to new notifications.',
            )
        added = 0
        notified_workers = []
        for worker_id in worker_user_ids:
            self.db.add(
                RequestNotification(
                    id=uuid4(),
                    staffing_request_id=staffing_request.id,
                    worker_user_id=worker_id,
                    channel=NotificationChannel.IN_APP,
                    delivery_status='queued',
                )
            )
            existing = self.response_repository.get_for_request_and_worker(staffing_request.id, worker_id)
            if existing is None:
                self.db.add(
                    RequestResponse(
                        id=uuid4(),
                        staffing_request_id=staffing_request.id,
                        worker_user_id=worker_id,
                        status=ResponseStatus.NOTIFIED,
                    )
                )
                added += 1
            elif existing.status == ResponseStatus.DECLINED:
                existing.status = ResponseStatus.NOTIFIED
                existing.responded_at = None
                existing.decline_reason = None
                added += 1
            worker = self.worker_repository.get(worker_id)
            if worker:
                notified_workers.append(worker)

        if staffing_request.status == RequestStatus.OPEN:
            staffing_request.status = RequestStatus.NOTIFIED
            self.repository.save(staffing_request)

        self.audit_service.log(
            action='staffing_request.renotified',
            entity_type='staffing_request',
            entity_id=staffing_request.id,
            actor_user_id=actor_user_id,
            organization_id=staffing_request.organization_id,
            payload={'targeted': True, 'new_notifications': added},
        )
        self.db.commit()
        if notified_workers:
            self.dispatcher.notify_workers(staffing_request, notified_workers)
        return added

    @staticmethod
    def _requirement_code(item: dict | str) -> str:
        if isinstance(item, dict):
            return str(item.get('code') or item.get('value') or item.get('label') or '').strip()
        return str(item).strip()

    @staticmethod
    def _requirement_label(item: dict | str) -> str | None:
        if isinstance(item, dict):
            value = item.get('label')
            return str(value).strip() if value else None
        return None

    def cancel(self, request_id: UUID) -> StaffingRequest:
        staffing_request = self._get_required(request_id)
        staffing_request.status = RequestStatus.CANCELLED
        staffing_request.cancelled_at = datetime.utcnow()
        self.repository.save(staffing_request)
        self.audit_service.log(
            action='staffing_request.cancelled',
            entity_type='staffing_request',
            entity_id=staffing_request.id,
            actor_user_id=staffing_request.created_by_user_id,
            organization_id=staffing_request.organization_id,
        )
        self.db.commit()
        return staffing_request

    def _get_required(self, request_id: UUID) -> StaffingRequest:
        staffing_request = self.repository.get(request_id)
        if staffing_request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
        return staffing_request
