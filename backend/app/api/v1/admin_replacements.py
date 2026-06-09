"""Coordinator self-serve replacement surface (SELF_SERVE_REPLACEMENT §5, §6.1).

GET  /api/v1/admin/replacements          — the self-filled feed + KPIs
GET  /api/v1/admin/replacements/policy   — per-org policy (auto|approval + roles + lead)
PATCH /api/v1/admin/replacements/policy  — edit it
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.replacement import (
    ReplacementFeedResponse,
    ReplacementPolicyRead,
    ReplacementPolicyUpdate,
)
from app.schemas.staffing_request import StaffingRequestRead
from app.services.replacement_admin_service import ReplacementAdminService


class ReplacementDeny(BaseModel):
    reason: str | None = None


router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('', response_model=ReplacementFeedResponse)
def list_replacements(
    status: str | None = None,  # live | history
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> ReplacementFeedResponse:
    return ReplacementAdminService(db).coordinator_feed(scope, status)


@router.get('/policy', response_model=ReplacementPolicyRead)
def get_replacement_policy(
    organization_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> ReplacementPolicyRead:
    return ReplacementAdminService(db).get_policy(organization_id, scope)


@router.patch('/policy', response_model=ReplacementPolicyRead)
def update_replacement_policy(
    organization_id: UUID,
    payload: ReplacementPolicyUpdate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> ReplacementPolicyRead:
    return ReplacementAdminService(db).set_policy(organization_id, payload, scope)


@router.post('/sweep')
def sweep_replacements(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    """Housekeeping (§7): auto-publish timed-out approvals + expire past-cutoff
    opens. Manual for now (cron-ready) — see the reliability-recompute pattern."""
    return ReplacementAdminService(db).sweep(scope)


@router.post('/{request_id}/approve', response_model=StaffingRequestRead)
def approve_replacement(
    request_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    request = ReplacementAdminService(db).approve(request_id, scope)
    return StaffingRequestRead.model_validate(request)


@router.post('/{request_id}/deny', response_model=StaffingRequestRead)
def deny_replacement(
    request_id: UUID,
    payload: ReplacementDeny,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StaffingRequestRead:
    request = ReplacementAdminService(db).deny(request_id, scope, payload.reason)
    return StaffingRequestRead.model_validate(request)
