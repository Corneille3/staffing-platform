"""Admin draft create + autosave PATCH for `/admin/requests/new`.

POST is a thin alias to StaffingRequestService.create so the URL space matches
the rest of the admin surface (`/api/v1/admin/...`). PATCH is the autosave
endpoint — only drafts can be edited; published requests must go through
cancel/renotify.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.admin import AdminRequestsResponse
from app.schemas.staffing_request import (
    StaffingRequestCreate,
    StaffingRequestDraftUpdate,
    StaffingRequestRead,
)
from app.services.admin_request_service import AdminRequestService
from app.services.staffing_request_service import StaffingRequestService

router = APIRouter(dependencies=[Depends(require_admin)])


class NotifyWorkersBody(BaseModel):
    worker_user_ids: list[UUID]


@router.post('/{request_id}/notify')
def notify_workers(
    request_id: UUID,
    payload: NotifyWorkersBody,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    added = StaffingRequestService(db).notify_specific(request_id, payload.worker_user_ids, scope.user.id)
    return {'newly_notified': added}


@router.get('', response_model=AdminRequestsResponse)
def list_admin_requests(
    tab: str = Query('active', pattern='^(active|assigned|all)$'),
    site_id: UUID | None = Query(None),
    urgency: str = Query('all', pattern='^(all|urgent|planned)$'),
    language: str = Query('all'),
    cursor: str | None = Query(None),
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AdminRequestsResponse:
    result = AdminRequestService(db).list_summaries(
        scope, tab=tab, site_id=site_id, urgency=urgency, language=language, cursor=cursor,
    )
    return AdminRequestsResponse(**result)


@router.post('', response_model=StaffingRequestRead, status_code=status.HTTP_201_CREATED)
def create_admin_request(
    payload: StaffingRequestCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).create(payload, scope)
    return StaffingRequestRead.model_validate(staffing_request)


@router.patch('/{request_id}', response_model=StaffingRequestRead)
def patch_admin_request_draft(
    request_id: UUID,
    payload: StaffingRequestDraftUpdate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    staffing_request = StaffingRequestService(db).update_draft(request_id, payload, scope)
    return StaffingRequestRead.model_validate(staffing_request)
