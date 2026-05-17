from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.repositories.worker_repository import WorkerRepository
from app.schemas.eligibility import EligibilityResult
from app.schemas.staffing_request import StaffingRequestCreate, StaffingRequestRead
from app.services.matching_service import MatchingService
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


@router.get('/{request_id}/eligibility')
def get_request_eligibility(
    request_id: UUID,
    worker_user_id: UUID | None = None,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> EligibilityResult:
    request_repo = StaffingRequestRepository(db)
    staffing_request = request_repo.get(request_id)
    if staffing_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
    if not request_repo.can_access(staffing_request, scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')

    target_worker_id = worker_user_id or (scope.user.id if scope.is_worker else None)
    if target_worker_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='worker_user_id is required for admin eligibility checks.',
        )
    if scope.is_worker and target_worker_id != scope.user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')

    worker = WorkerRepository(db).get(target_worker_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Worker not found')

    return MatchingService(db=db).eligibility_result(staffing_request, worker)


@router.post('', status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_staffing_request(
    payload: StaffingRequestCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).create(payload, scope)
    return StaffingRequestRead.model_validate(staffing_request)


@router.post('/{request_id}/publish', dependencies=[Depends(require_admin)])
def publish_staffing_request(request_id: UUID, db: Session = Depends(get_db_session)) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).publish(request_id)
    return StaffingRequestRead.model_validate(staffing_request)


@router.post('/{request_id}/cancel', dependencies=[Depends(require_admin)])
def cancel_staffing_request(request_id: UUID, db: Session = Depends(get_db_session)) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).cancel(request_id)
    return StaffingRequestRead.model_validate(staffing_request)


@router.post('/{request_id}/renotify', dependencies=[Depends(require_admin)])
def renotify_staffing_request(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).renotify(request_id, actor_user_id=scope.user.id)
    return StaffingRequestRead.model_validate(staffing_request)
