from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.scope import AccessScope, get_access_scope
from app.models.enums import ResponseStatus
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.schemas.assignment import AssignmentRead
from app.schemas.replacement import AbsenceReportCreate
from app.schemas.request_response import RequestResponseAction, RequestResponseRead
from app.schemas.staffing_request import StaffingRequestRead
from app.services.matching_service import MatchingService
from app.services.replacement_service import ReplacementService
from app.services.response_service import ResponseService


class RequestRelease(BaseModel):
    reason: str | None = None  # sick | family | personal | other


router = APIRouter()


@router.get('/report-absence/options')
def absence_report_options(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    """Sites (the worker's tenant orgs) + each site's allowed roles, for the
    permanent-staff absence form (SELF_SERVE §1)."""
    return {'sites': ReplacementService(db).absence_options(scope)}


@router.get('/report-absence/mine')
def my_absence_reports(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    """The worker's own reported absences + status, so they can return to the
    page and see whether each was covered (SELF_SERVE §1)."""
    return {'items': ReplacementService(db).my_absence_reports(scope)}


@router.post('/report-absence')
def report_absence(
    payload: AbsenceReportCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    """Permanent staff report a shift they'll miss → a staff_absence request
    that broadcasts to the eligible pool (SELF_SERVE §1)."""
    replacement = ReplacementService(db).report_absence(payload, scope)
    return StaffingRequestRead.model_validate(replacement)


@router.post('/{request_id}/release')
def release_shift(
    request_id: UUID,
    payload: RequestRelease,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    """Self-serve: the worker holding this shift releases it to the eligible
    pool (SELF_SERVE_REPLACEMENT §2). Returns the new worker_replacement
    request the pool will claim."""
    replacement = ReplacementService(db).release(request_id, scope, payload.reason)
    return StaffingRequestRead.model_validate(replacement)


@router.post('/{request_id}/claim')
def claim_shift(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AssignmentRead:
    """A substitute claims an open replacement (§3). First-claim-wins; losers
    get 409 ``already_filled``. Eligibility is re-checked at the moment of the
    tap (§7) — availability may have changed since the broadcast."""
    request = StaffingRequestRepository(db).get(request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Shift not found.')
    if not MatchingService(db=db).eligibility_result(request, scope.user).eligible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='You are no longer eligible for this shift.',
        )
    assignment = ReplacementService(db).claim(request_id, scope.user.id, scope.tenant_id)
    return AssignmentRead.model_validate(assignment)


@router.post('/{request_id}/cancel-release')
def cancel_release(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    """The giver cancels their own release before anyone claims (§7) — they
    keep the shift."""
    request = ReplacementService(db).cancel_release(request_id, scope)
    return StaffingRequestRead.model_validate(request)


@router.get('/{request_id}/replacement-status')
def replacement_status(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    """Live tally + filled state for the giver's waiting screen (§6)."""
    return ReplacementService(db).replacement_status(request_id, scope)


@router.get('/{request_id}/active-replacement')
def active_replacement(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict | None:
    """Given the ORIGINAL request the caller holds, the live release they've
    already put out (or null). Lets the tracking page show 'waiting for a claim'
    on reload instead of re-offering release (which would 409)."""
    return ReplacementService(db).active_replacement_for(request_id, scope)


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


@router.post('/{request_id}/responses/view')
def view_request_response(
    request_id: UUID,
    payload: RequestResponseAction,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> RequestResponseRead:
    if not scope.is_admin and payload.worker_user_id != scope.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only mark their own responses as viewed.',
        )
    saved = ResponseService(db).mark_viewed(request_id, payload.worker_user_id)
    return RequestResponseRead.model_validate(saved)


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


@router.post('/{request_id}/responses/withdraw')
def withdraw_request_response(
    request_id: UUID,
    payload: RequestResponseAction,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> RequestResponseRead:
    if not scope.is_admin and payload.worker_user_id != scope.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only withdraw their own response.',
        )
    saved = ResponseService(db).withdraw(request_id, payload.worker_user_id)
    return RequestResponseRead.model_validate(saved)
