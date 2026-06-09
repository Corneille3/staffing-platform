"""Coordinator self-serve replacement surface (SELF_SERVE_REPLACEMENT §5, §6.1).

GET  /api/v1/admin/replacements          — the self-filled feed + KPIs
GET  /api/v1/admin/replacements/policy   — per-org policy (auto|managed + roles + lead)
PATCH /api/v1/admin/replacements/policy  — edit it
POST /api/v1/admin/replacements/sweep    — expire still-searching, past-cutoff releases
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.replacement import (
    ReplacementFeedResponse,
    ReplacementPolicyRead,
    ReplacementPolicyUpdate,
)
from app.services.replacement_admin_service import ReplacementAdminService

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
    """Housekeeping (§7): expire still-searching releases whose shift already
    started with no fill. Manual for now (cron-ready) — see the
    reliability-recompute pattern."""
    return ReplacementAdminService(db).sweep(scope)
