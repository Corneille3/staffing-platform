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
from zoneinfo import ZoneInfo
from threading import Lock
from uuid import UUID, uuid4

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.config import settings
from app.core.geo import haversine_m
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus
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

    @staticmethod
    def _excel_buf() -> io.StringIO:
        """CSV tuned for the actual reader: Québec-French Excel. The UTF-8
        BOM makes Excel decode accents correctly (else Étoiles → Ã‰toiles),
        and the ';' delimiter matches the fr locale's list separator (else
        the whole row lands in one column). Sheets/LibreOffice handle both
        fine."""
        buf = io.StringIO()
        buf.write('\ufeff')
        return buf

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

        buf = self._excel_buf()
        writer = csv.writer(buf, delimiter=';')
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

    # ── Payroll view (SPEC_CHECKOUT_HOURS §6) ───────────────────────────────
    _WORKED_HOURS_HEADER = [
        'org', 'work_date', 'worker_name', 'role',
        'scheduled_start', 'scheduled_end', 'scheduled_hours',
        'actual_in', 'actual_out', 'worked_hours', 'variance_hours',
        'geo_ok', 'status', 'corrected', 'corrected_by', 'reason',
    ]

    def generate_worked_hours_csv(
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
        buf = self._excel_buf()
        writer = csv.writer(buf, delimiter=';')
        writer.writerow(self._WORKED_HOURS_HEADER)
        if not scoped_org_ids:
            return buf.getvalue().encode('utf-8'), 0

        adjuster = sa.orm.aliased(User)
        rows = self.db.execute(
            select(
                Organization.name.label('org_name'),
                Organization.latitude.label('org_lat'),
                Organization.longitude.label('org_lon'),
                Organization.geofence_radius_m,
                StaffingRequest.work_date,
                StaffingRequest.role,
                StaffingRequest.start_time,
                StaffingRequest.end_time,
                User.first_name.label('worker_first'),
                User.last_name.label('worker_last'),
                Assignment.checked_in_at,
                Assignment.checked_in_latitude,
                Assignment.checked_in_longitude,
                Assignment.checked_out_at,
                Assignment.checked_out_latitude,
                Assignment.checked_out_longitude,
                Assignment.hours_adjusted_at,
                Assignment.hours_adjustment_reason,
                adjuster.first_name.label('adjuster_first'),
                adjuster.last_name.label('adjuster_last'),
            )
            .select_from(Assignment)
            .join(StaffingRequest, StaffingRequest.id == Assignment.staffing_request_id)
            .join(Organization, StaffingRequest.organization_id == Organization.id)
            .join(User, Assignment.worker_user_id == User.id)
            .join(adjuster, Assignment.hours_adjusted_by_user_id == adjuster.id, isouter=True)
            .where(
                StaffingRequest.organization_id.in_(scoped_org_ids),
                StaffingRequest.work_date >= date_from,
                StaffingRequest.work_date <= date_to,
                # Cancelled/released rows carry no attendance (stamps cleared
                # on cancel); confirmed-but-open rows MUST appear — an export
                # that silently drops them under-reports payroll.
                Assignment.status.in_((AssignmentStatus.CONFIRMED, AssignmentStatus.COMPLETED)),
            )
            .order_by(StaffingRequest.work_date.asc(), StaffingRequest.start_time.asc())
        ).all()

        for r in rows:
            scheduled_h = self._scheduled_hours(r.start_time, r.end_time)
            worked_h = None
            if r.checked_in_at and r.checked_out_at:
                worked_h = round((r.checked_out_at - r.checked_in_at).total_seconds() / 3600, 2)
            if r.checked_in_at is None:
                row_status = 'non pointé'
            elif r.checked_out_at is None:
                row_status = 'sortie non pointée'
            else:
                row_status = 'ok'
            writer.writerow([
                r.org_name,
                r.work_date.isoformat(),
                f'{r.worker_first} {r.worker_last}'.strip(),
                r.role.value if hasattr(r.role, 'value') else (str(r.role) if r.role else ''),
                r.start_time.strftime('%H:%M') if r.start_time else '',
                r.end_time.strftime('%H:%M') if r.end_time else '',
                f'{scheduled_h}' if scheduled_h is not None else '',
                self._local_hhmm(r.checked_in_at),
                self._local_hhmm(r.checked_out_at),
                f'{worked_h}' if worked_h is not None else '',
                f'{round(worked_h - scheduled_h, 2)}' if worked_h is not None and scheduled_h is not None else '',
                self._geo_ok_label(r),
                row_status,
                'yes' if r.hours_adjusted_at else 'no',
                f'{r.adjuster_first} {r.adjuster_last}'.strip() if r.adjuster_first else '',
                r.hours_adjustment_reason or '',
            ])
        return buf.getvalue().encode('utf-8'), len(rows)

    @staticmethod
    def _local_hhmm(stamp: datetime | None) -> str:
        """Attendance stamps are stored UTC; the payroll reader thinks in
        wall-clock next to the scheduled times, so render local HH:MM
        (settings.shift_timezone, same convention as timeutil)."""
        if stamp is None:
            return ''
        return stamp.astimezone(ZoneInfo(settings.shift_timezone)).strftime('%H:%M')

    @staticmethod
    def _scheduled_hours(start_time, end_time) -> float | None:
        if start_time is None or end_time is None:
            return None
        minutes = (end_time.hour * 60 + end_time.minute) - (start_time.hour * 60 + start_time.minute)
        if minutes <= 0:  # crosses midnight, per timeutil convention
            minutes += 24 * 60
        return round(minutes / 60, 2)

    @staticmethod
    def _geo_ok_label(r) -> str:
        """'yes' when every computable stamp fell inside the site radius,
        'no' when any fell outside, '' when nothing was computable."""
        if r.org_lat is None or r.org_lon is None:
            return ''
        radius = r.geofence_radius_m or settings.geofence_default_radius_m
        checks: list[bool] = []
        for lat, lon in (
            (r.checked_in_latitude, r.checked_in_longitude),
            (r.checked_out_latitude, r.checked_out_longitude),
        ):
            if lat is not None and lon is not None:
                distance = haversine_m(float(r.org_lat), float(r.org_lon), float(lat), float(lon))
                checks.append(distance <= radius)
        if not checks:
            return ''
        return 'yes' if all(checks) else 'no'

    def _empty_csv(self) -> bytes:
        buf = self._excel_buf()
        writer = csv.writer(buf, delimiter=';')
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
        view: str = 'requests',
    ) -> None:
        """Generate the CSV synchronously and mark the job ready.

        Called from a FastAPI BackgroundTask after the response has been sent
        to the client. Stores the CSV bytes in the job for download.
        """
        job = _fetch(job_id)
        if job is None:
            return
        try:
            generate = (
                self.generate_worked_hours_csv if view == 'worked_hours' else self.generate_csv
            )
            csv_bytes, row_count = generate(scope, date_from, date_to, org_ids)
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
            f'Your export of {job.row_count} row(s) is ready.\n\n'
            f'Download it from the export page (jobs are cleared when the '
            f'server restarts):\n{download_url}\n\n'
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
