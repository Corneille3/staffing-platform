from datetime import datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import NotificationChannel, RequestStatus, ResponseStatus
from app.models.enums import RequestRequirementType
from app.models.request_notification import RequestNotification
from app.models.request_requirement import RequestRequirement
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.repositories.worker_repository import WorkerRepository
from app.schemas.staffing_request import StaffingRequestCreate
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
        self.matching_service = MatchingService()
        self.dispatcher = NotificationDispatcher(db)

    def list(self) -> list[StaffingRequest]:
        return self.repository.list()

    def get(self, request_id: UUID) -> StaffingRequest | None:
        return self.repository.get(request_id)

    def create(self, payload: StaffingRequestCreate) -> StaffingRequest:
        staffing_request = StaffingRequest(
            id=uuid4(),
            organization_id=payload.organization_id,
            created_by_user_id=payload.created_by_user_id,
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

    def publish(self, request_id: UUID) -> StaffingRequest:
        staffing_request = self._get_required(request_id)
        if staffing_request.status not in {RequestStatus.DRAFT, RequestStatus.OPEN}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Request cannot be published')

        workers = self.worker_repository.list()
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

        workers = self.worker_repository.list()
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
