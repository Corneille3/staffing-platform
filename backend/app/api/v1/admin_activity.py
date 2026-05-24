"""Coordinator audit timeline (ADMIN_ORG_HISTORY_HANDOFF §3).

GET /api/v1/admin/activity — the same audit_logs feed as APF activity, scoped
to the caller's sites, with the request-lifecycle bucket taxonomy, KPI strip,
optional site + date-range filters, and cursor pagination.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
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


@router.get('/export')
def export_admin_activity(
    filter: AdminActivityFilter = Query(AdminActivityFilter.ALL),
    site_id: UUID | None = Query(None),
    since: datetime | None = Query(None, alias='from'),
    until: datetime | None = Query(None, alias='to'),
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """Synchronous CSV download of the scoped activity (no Inngest/email infra
    here — direct download is simpler and immediate)."""
    result = ReportingService(db).admin_activity(
        scope=scope, filter_bucket=filter.value, limit=100, site_id=site_id, since=since, until=until,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['timestamp', 'action', 'actor', 'role', 'organization', 'request', 'reason'])
    for it in result['items']:
        actor = it.get('actor')
        org = it.get('organization')
        payload = it.get('payload') or {}
        writer.writerow([
            it['created_at'].isoformat() if hasattr(it['created_at'], 'isoformat') else str(it['created_at']),
            it['action'],
            f"{actor['first_name']} {actor['last_name']}" if actor else 'system',
            actor['role'] if actor else '',
            org['name'] if org else '',
            it.get('request_title') or '',
            payload.get('reason', ''),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="activity.csv"'},
    )
