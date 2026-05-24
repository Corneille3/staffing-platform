"""APF CSV export service.

Produces a CSV of staffing-request activity scoped to the caller's tenant with
optional date + organization filters. The job registry is process-local — fine
for v2 pilot, but means jobs are lost on backend restart. Migrating to a real
queue (Redis/Inngest/Celery) is the path forward for production-scale exports.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import date, datetime, timezone
from threading import Lock
from uuid import UUID, uuid4

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService

logger = logging.getLogger(__name__)


class _ExportJob:
    __slots__ = (
        'id', 'status', 'created_at', 'completed_at', 'row_count',
        'csv_bytes', 'error', 'requested_by_email',
    )

    def __init__(self, requested_by_email: str | None) -> None:
        self.id: UUID = uuid4()
        self.status: str = 'pending'
        self.created_at: datetime = datetime.now(timezone.utc)
        self.completed_at: datetime | None = None
        self.row_count: int | None = None
        self.csv_bytes: bytes | None = None
        self.error: str | None = None
        self.requested_by_email: str | None = requested_by_email


_jobs: dict[UUID, _ExportJob] = {}
_jobs_lock = Lock()


def _store(job: _ExportJob) -> None:
    with _jobs_lock:
        _jobs[job.id] = job


def _fetch(job_id: UUID) -> _ExportJob | None:
    with _jobs_lock:
        return _jobs.get(job_id)


def _invalidate_jobs() -> None:
    """Test hook."""
    with _jobs_lock:
        _jobs.clear()


class ExportService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.email = EmailNotificationService()

    def create_job(self, requested_by_email: str | None) -> _ExportJob:
        job = _ExportJob(requested_by_email=requested_by_email)
        _store(job)
        return job

    def get_job(self, job_id: UUID) -> _ExportJob | None:
        return _fetch(job_id)

    def _scope_orgs(self, scope: AccessScope, requested: list[UUID] | None) -> list[UUID]:
        """Resolve the org IDs to include, restricted to caller's scope."""
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return []
            in_scope = list(
                self.db.scalars(
                    select(Organization.id).where(Organization.tenant_id == scope.tenant_id)
                ).all()
            )
        else:
            in_scope = list(scope.org_ids)

        if requested is None:
            return in_scope

        in_scope_set = set(in_scope)
        for org_id in requested:
            if org_id not in in_scope_set:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f'You do not have access to organization {org_id}.',
                )
        return list(requested)

    def generate_csv(
        self,
        scope: AccessScope,
        date_from: date,
        date_to: date,
        org_ids: list[UUID] | None,
    ) -> tuple[bytes, int]:
        if date_from > date_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='date_from must be on or before date_to.',
            )

        scoped_org_ids = self._scope_orgs(scope, org_ids)
        if not scoped_org_ids:
            return self._empty_csv(), 0

        # Fetch requests + joined assignment + worker + org in one go.
        rows = self.db.execute(
            select(
                StaffingRequest.id,
                StaffingRequest.title,
                StaffingRequest.status,
                StaffingRequest.city,
                StaffingRequest.work_date,
                StaffingRequest.start_time,
                StaffingRequest.end_time,
                StaffingRequest.created_at,
                Organization.name.label('org_name'),
                Assignment.assigned_at,
                Assignment.status.label('assignment_status'),
                User.first_name.label('worker_first'),
                User.last_name.label('worker_last'),
            )
            .join(Organization, StaffingRequest.organization_id == Organization.id)
            .join(
                Assignment,
                Assignment.staffing_request_id == StaffingRequest.id,
                isouter=True,
            )
            .join(User, Assignment.worker_user_id == User.id, isouter=True)
            .where(
                StaffingRequest.organization_id.in_(scoped_org_ids),
                StaffingRequest.work_date >= date_from,
                StaffingRequest.work_date <= date_to,
            )
            .order_by(StaffingRequest.work_date.asc(), StaffingRequest.created_at.asc())
        ).all()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            'request_id', 'organization', 'city', 'title', 'status',
            'work_date', 'start_time', 'end_time', 'created_at',
            'assigned_worker', 'assignment_status', 'assigned_at',
            'time_to_fill_hours',
        ])

        for r in rows:
            worker_name = (
                f'{r.worker_first} {r.worker_last}'
                if r.worker_first and r.worker_last else ''
            )
            time_to_fill = ''
            if r.assigned_at and r.created_at:
                delta = r.assigned_at - r.created_at
                time_to_fill = f'{round(delta.total_seconds() / 3600, 2)}'
            writer.writerow([
                str(r.id),
                r.org_name,
                r.city,
                r.title,
                r.status.value if hasattr(r.status, 'value') else str(r.status),
                r.work_date.isoformat() if r.work_date else '',
                r.start_time.isoformat() if r.start_time else '',
                r.end_time.isoformat() if r.end_time else '',
                r.created_at.isoformat() if r.created_at else '',
                worker_name,
                (r.assignment_status.value if hasattr(r.assignment_status, 'value')
                 else (str(r.assignment_status) if r.assignment_status else '')),
                r.assigned_at.isoformat() if r.assigned_at else '',
                time_to_fill,
            ])

        return buf.getvalue().encode('utf-8'), len(rows)

    def _empty_csv(self) -> bytes:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            'request_id', 'organization', 'city', 'title', 'status',
            'work_date', 'start_time', 'end_time', 'created_at',
            'assigned_worker', 'assignment_status', 'assigned_at',
            'time_to_fill_hours',
        ])
        return buf.getvalue().encode('utf-8')

    def run_job(
        self,
        job_id: UUID,
        scope: AccessScope,
        date_from: date,
        date_to: date,
        org_ids: list[UUID] | None,
        download_url: str,
    ) -> None:
        """Generate the CSV synchronously and mark the job ready.

        Called from a FastAPI BackgroundTask after the response has been sent
        to the client. Stores the CSV bytes in the job for download.
        """
        job = _fetch(job_id)
        if job is None:
            return
        try:
            csv_bytes, row_count = self.generate_csv(scope, date_from, date_to, org_ids)
            job.csv_bytes = csv_bytes
            job.row_count = row_count
            job.completed_at = datetime.now(timezone.utc)
            job.status = 'ready'
            self._send_ready_email(job, download_url)
        except Exception as exc:  # noqa: BLE001 — record any failure on the job
            job.error = str(getattr(exc, 'detail', exc))
            job.status = 'failed'
            job.completed_at = datetime.now(timezone.utc)
            logger.exception('Export job %s failed', job_id)

    def _send_ready_email(self, job: _ExportJob, download_url: str) -> None:
        if not job.requested_by_email:
            return
        subject = '[Staffig] Your APF export is ready'
        body = (
            f'Your export of {job.row_count} request(s) is ready.\n\n'
            f'Download (link expires when the server restarts):\n{download_url}\n\n'
            f'— Staffig'
        )
        try:
            self.email.send(EmailMessage(
                to_email=job.requested_by_email, subject=subject, body=body,
            ))
        except Exception:  # noqa: BLE001
            logger.warning('Failed to email export link to %s', job.requested_by_email)


# Touch sa to keep the import even if unused — handy when adding new filters.
_ = sa
