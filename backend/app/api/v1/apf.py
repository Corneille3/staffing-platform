"""APF (Affiliated Platform Federation) oversight endpoints.

APF users sit above the dispatch surface: they observe the network, they don't
dispatch shifts themselves. Endpoints here are read-mostly and aggregate across
the affiliated organizations in scope.

The snapshot endpoint is the dashboard's single round-trip — it returns kpis,
status_breakdown, shortage_cities, and org_activity in one shot. Results are
memoized per tenant for 60s to absorb dashboard reloads without re-running the
aggregate every time.
"""

from __future__ import annotations

import time
from datetime import datetime
from threading import Lock
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_network_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.apf import (
    ActivityFilter,
    ApfActivity,
    ApfExportJob,
    ApfExportRequest,
    ApfSnapshot,
    BulkInvitePayload,
    BulkInviteResult,
    NetworkPool,
    OrgSnapshot,
    ReliabilityRecomputeResult,
)
from app.schemas.worker import WorkerInviteCreate
from app.services.export_service import ExportService
from app.services.reporting_service import ReportingService
from app.services.worker_service import WorkerService

router = APIRouter(dependencies=[Depends(require_network_admin)])

_SNAPSHOT_TTL_SECONDS = 60
_snapshot_cache: dict[str, tuple[float, dict]] = {}
_snapshot_cache_lock = Lock()


def _cache_key(scope: AccessScope) -> str:
    if scope.tenant_id:
        return f'tenant:{scope.tenant_id}'
    if scope.org_ids:
        # Stable across calls — sorted UUIDs concatenated.
        return 'orgs:' + ','.join(sorted(str(o) for o in scope.org_ids))
    return 'empty'


def _invalidate_snapshot_cache() -> None:
    """Test hook — clear the per-tenant cache."""
    with _snapshot_cache_lock:
        _snapshot_cache.clear()


@router.get('/snapshot', response_model=ApfSnapshot)
def get_apf_snapshot(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    key = _cache_key(scope)
    now = time.monotonic()

    with _snapshot_cache_lock:
        cached = _snapshot_cache.get(key)
        if cached is not None:
            stored_at, payload = cached
            if now - stored_at < _SNAPSHOT_TTL_SECONDS:
                return payload

    payload = ReportingService(db).apf_snapshot(scope)

    with _snapshot_cache_lock:
        _snapshot_cache[key] = (now, payload)

    return payload


@router.get('/activity', response_model=ApfActivity)
def get_apf_activity(
    filter: ActivityFilter = Query(ActivityFilter.ALL),
    cursor: datetime | None = Query(None, description='Return rows older than this ISO timestamp'),
    limit: int = Query(50, ge=1, le=100),
    org_id: UUID | None = Query(None, description='Restrict to one organization'),
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    return ReportingService(db).apf_activity(
        scope=scope,
        filter_bucket=filter.value,
        cursor=cursor,
        limit=limit,
        org_id=org_id,
    )


@router.get('/substitutes', response_model=NetworkPool)
def get_network_pool(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    return ReportingService(db).network_pool(scope)


@router.get('/organizations/{org_id}/snapshot', response_model=OrgSnapshot)
def get_org_snapshot(
    org_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    return ReportingService(db).org_snapshot(scope, org_id)


@router.post(
    '/substitutes/invite',
    response_model=BulkInviteResult,
    status_code=201,
)
def bulk_invite_substitutes(
    payload: BulkInvitePayload,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    worker_service = WorkerService(db)
    outcomes = []
    invited = 0
    skipped = 0

    for entry in payload.invitees:
        email = entry.email.strip().lower()
        if not email:
            outcomes.append({
                'email': entry.email, 'status': 'skipped',
                'reason': 'missing email', 'user_id': None,
            })
            skipped += 1
            continue
        try:
            user = worker_service.invite(
                WorkerInviteCreate(
                    first_name=entry.first_name.strip(),
                    last_name=entry.last_name.strip(),
                    email=email,
                    phone=entry.phone,
                    preferred_language=entry.preferred_language,
                ),
                scope,
            )
            outcomes.append({
                'email': email, 'status': 'invited',
                'reason': None, 'user_id': user.id,
            })
            invited += 1
        except Exception as exc:  # noqa: BLE001 — surface reason per row
            outcomes.append({
                'email': email, 'status': 'skipped',
                'reason': str(getattr(exc, 'detail', exc)), 'user_id': None,
            })
            skipped += 1

    # Refresh the snapshot cache — newly invited workers should appear.
    _invalidate_snapshot_cache()

    return {
        'invited_count': invited,
        'skipped_count': skipped,
        'outcomes': outcomes,
    }


@router.post(
    '/substitutes/recompute-reliability',
    response_model=ReliabilityRecomputeResult,
)
def recompute_reliability(
    db: Session = Depends(get_db_session),
) -> dict:
    updated = WorkerService(db).recompute_reliability_all()
    return {'updated': updated}


def _job_to_dict(job, base_url: str) -> dict:
    return {
        'id': job.id,
        'status': job.status,
        'created_at': job.created_at,
        'completed_at': job.completed_at,
        'row_count': job.row_count,
        'download_url': f'{base_url}/{job.id}/download' if job.status == 'ready' else None,
        'error': job.error,
    }


@router.post('/export', response_model=ApfExportJob, status_code=202)
def create_export_job(
    payload: ApfExportRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    if payload.date_from > payload.date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='date_from must be on or before date_to.',
        )

    service = ExportService(db)
    job = service.create_job(requested_by_email=scope.user.email)

    base_url = str(request.url_for('create_export_job')).rstrip('/')
    download_link = f'{base_url}/{job.id}/download'

    background_tasks.add_task(
        ExportService(db).run_job,
        job_id=job.id,
        scope=scope,
        date_from=payload.date_from,
        date_to=payload.date_to,
        org_ids=payload.org_ids,
        download_url=download_link,
        view=payload.view.value,
    )
    return _job_to_dict(job, base_url)


@router.get('/export/{job_id}', response_model=ApfExportJob)
def get_export_job(
    job_id: UUID,
    request: Request,
    db: Session = Depends(get_db_session),
) -> dict:
    job = ExportService(db).get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Export job not found (may have been cleared on restart).',
        )
    base_url = str(request.url_for('create_export_job')).rstrip('/')
    return _job_to_dict(job, base_url)


@router.get('/export/{job_id}/download')
def download_export(
    job_id: UUID,
    db: Session = Depends(get_db_session),
) -> Response:
    job = ExportService(db).get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Export job not found (may have been cleared on restart).',
        )
    if job.status != 'ready' or job.csv_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Export job is {job.status}, not ready for download.',
        )
    filename = f'staffig-export-{job.created_at.date().isoformat()}.csv'
    return Response(
        content=job.csv_bytes,
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
        },
    )
