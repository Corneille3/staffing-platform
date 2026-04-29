from datetime import datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import NotificationChannel, RequestStatus, ResponseStatus
from app.models.request_notification import RequestNotification
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.repositories.worker_repository import WorkerRepository
from app.schemas.staffing_request import StaffingRequestCreate
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
            required_qualifications=list(payload.required_qualifications),
            required_certifications=list(payload.required_certifications),
        )
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
        return staffing_request

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
