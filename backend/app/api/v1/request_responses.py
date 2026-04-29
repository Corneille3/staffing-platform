from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.repositories.response_repository import ResponseRepository
from app.schemas.request_response import RequestResponseAction, RequestResponseRead
from app.models.enums import ResponseStatus
from app.services.response_service import ResponseService

router = APIRouter()


@router.get('/{request_id}/responses')
def list_request_responses(
    request_id: UUID,
    db: Session = Depends(get_db_session),
) -> dict[str, object]:
    responses = ResponseRepository(db).list_for_request(request_id)
    return {
        'request_id': request_id,
        'items': [RequestResponseRead.model_validate(item) for item in responses],
    }


@router.post('/{request_id}/responses/accept')
def accept_request_response(
    request_id: UUID,
    payload: RequestResponseAction,
    db: Session = Depends(get_db_session),
) -> RequestResponseRead:
    saved = ResponseService(db).set_status(request_id, payload.worker_user_id, ResponseStatus.ACCEPTED)
    return RequestResponseRead.model_validate(saved)


@router.post('/{request_id}/responses/decline')
def decline_request_response(
    request_id: UUID,
    payload: RequestResponseAction,
    db: Session = Depends(get_db_session),
) -> RequestResponseRead:
    saved = ResponseService(db).set_status(request_id, payload.worker_user_id, ResponseStatus.DECLINED)
    return RequestResponseRead.model_validate(saved)
