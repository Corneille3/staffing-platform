from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.schemas.staffing_request import StaffingRequestCreate, StaffingRequestRead
from app.services.staffing_request_service import StaffingRequestService

router = APIRouter()


@router.get('')
def list_staffing_requests(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[StaffingRequestRead]]:
    requests = StaffingRequestRepository(db).list_for_scope(scope)
    return {'items': [StaffingRequestRead.model_validate(item) for item in requests]}


@router.get('/{request_id}')
def get_staffing_request(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    repo = StaffingRequestRepository(db)
    staffing_request = repo.get(request_id)
    if staffing_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
    if not repo.can_access(staffing_request, scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
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
