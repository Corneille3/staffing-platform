from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.scope import AccessScope, get_access_scope
from app.models.enums import ResponseStatus
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.schemas.request_response import RequestResponseAction, RequestResponseRead
from app.services.response_service import ResponseService

router = APIRouter()


@router.get('/{request_id}/responses')
def list_request_responses(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, object]:
    repo = StaffingRequestRepository(db)
    staffing_request = repo.get(request_id)
    if staffing_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
    if not repo.can_access(staffing_request, scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')

    response_repo = ResponseRepository(db)
    if scope.is_admin:
        responses = response_repo.list_for_request(request_id)
    else:
        own = response_repo.get_for_request_and_worker(request_id, scope.user.id)
        responses = [own] if own else []

    return {
        'request_id': request_id,
        'items': [RequestResponseRead.model_validate(item) for item in responses],
    }


@router.post('/{request_id}/responses/accept')
def accept_request_response(
    request_id: UUID,
    payload: RequestResponseAction,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> RequestResponseRead:
    if not scope.is_admin and payload.worker_user_id != scope.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only respond on their own behalf.',
        )
    saved = ResponseService(db).set_status(request_id, payload.worker_user_id, ResponseStatus.ACCEPTED)
    return RequestResponseRead.model_validate(saved)


@router.post('/{request_id}/responses/decline')
def decline_request_response(
    request_id: UUID,
    payload: RequestResponseAction,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> RequestResponseRead:
    if not scope.is_admin and payload.worker_user_id != scope.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only respond on their own behalf.',
        )
    saved = ResponseService(db).set_status(
        request_id, payload.worker_user_id, ResponseStatus.DECLINED, payload.decline_reason
    )
    return RequestResponseRead.model_validate(saved)
