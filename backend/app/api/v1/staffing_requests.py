from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.schemas.staffing_request import StaffingRequestCreate, StaffingRequestRead
from app.services.staffing_request_service import StaffingRequestService

router = APIRouter()


@router.get('')
def list_staffing_requests(db: Session = Depends(get_db_session)) -> dict[str, list[StaffingRequestRead]]:
    requests = StaffingRequestService(db).list()
    return {'items': [StaffingRequestRead.model_validate(item) for item in requests]}


@router.get('/{request_id}')
def get_staffing_request(request_id: UUID, db: Session = Depends(get_db_session)) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).get(request_id)
    if staffing_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
    return StaffingRequestRead.model_validate(staffing_request)


@router.post('', status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_staffing_request(
    payload: StaffingRequestCreate,
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).create(payload)
    return StaffingRequestRead.model_validate(staffing_request)


@router.post('/{request_id}/publish', dependencies=[Depends(require_admin)])
def publish_staffing_request(request_id: UUID, db: Session = Depends(get_db_session)) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).publish(request_id)
    return StaffingRequestRead.model_validate(staffing_request)


@router.post('/{request_id}/cancel', dependencies=[Depends(require_admin)])
def cancel_staffing_request(request_id: UUID, db: Session = Depends(get_db_session)) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).cancel(request_id)
    return StaffingRequestRead.model_validate(staffing_request)
