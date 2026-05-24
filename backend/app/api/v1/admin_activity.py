"""Coordinator audit timeline (ADMIN_ORG_HISTORY_HANDOFF §3).

GET /api/v1/admin/activity — the same audit_logs feed as APF activity, scoped
to the caller's sites, with the request-lifecycle bucket taxonomy, KPI strip,
optional site + date-range filters, and cursor pagination.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.admin import AdminActivity, AdminActivityFilter
from app.services.reporting_service import ReportingService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('', response_model=AdminActivity)
def get_admin_activity(
    filter: AdminActivityFilter = Query(AdminActivityFilter.ALL),
    cursor: datetime | None = Query(None, description='Return rows older than this ISO timestamp'),
    limit: int = Query(50, ge=1, le=100),
    site_id: UUID | None = Query(None, description='Restrict to one site in scope'),
    since: datetime | None = Query(None, alias='from'),
    until: datetime | None = Query(None, alias='to'),
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    return ReportingService(db).admin_activity(
        scope=scope,
        filter_bucket=filter.value,
        cursor=cursor,
        limit=limit,
        site_id=site_id,
        since=since,
        until=until,
    )
