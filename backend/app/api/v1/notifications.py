from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.scope import AccessScope, get_access_scope
from app.models.assignment import Assignment
from app.models.organization import Organization
from app.models.request_notification import RequestNotification
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.schemas.notification import NotificationFeedItem, NotificationRead

router = APIRouter()


@router.get('')
def list_notifications(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[NotificationRead]]:
    stmt = select(RequestNotification).order_by(RequestNotification.created_at.desc())

    if scope.is_platform_admin:
        items = list(db.scalars(stmt).all())
    elif scope.is_network_admin:
        if not scope.tenant_id:
            items = []
        else:
            tenant_org_ids = select(Organization.id).where(Organization.tenant_id == scope.tenant_id)
            stmt = stmt.join(
                StaffingRequest, RequestNotification.staffing_request_id == StaffingRequest.id
            ).where(StaffingRequest.organization_id.in_(tenant_org_ids))
            items = list(db.scalars(stmt).all())
    elif scope.is_org_admin:
        if not scope.org_ids:
            items = []
        else:
            stmt = stmt.join(
                StaffingRequest, RequestNotification.staffing_request_id == StaffingRequest.id
            ).where(StaffingRequest.organization_id.in_(scope.org_ids))
            items = list(db.scalars(stmt).all())
    else:
        stmt = stmt.where(RequestNotification.worker_user_id == scope.user.id)
        items = list(db.scalars(stmt).all())

    return {'items': [NotificationRead.model_validate(item) for item in items]}


@router.get('/feed')
def get_notification_feed(
    worker_user_id: UUID | None = None,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[NotificationFeedItem]]:
    if worker_user_id is not None:
        if not scope.is_admin and scope.user.id != worker_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
        worker_id = worker_user_id
    elif scope.is_worker:
        worker_id = scope.user.id
    else:
        return {'items': []}
    feed: list[NotificationFeedItem] = []

    # New request / urgent — one entry per request_notification row
    notif_rows = db.scalars(
        select(RequestNotification)
        .where(RequestNotification.worker_user_id == worker_id)
        .join(StaffingRequest, RequestNotification.staffing_request_id == StaffingRequest.id)
    ).all()
    for row in notif_rows:
        req = db.get(StaffingRequest, row.staffing_request_id)
        if req is None:
            continue
        feed.append(NotificationFeedItem(
            id=f'notif-{row.id}',
            type='urgent' if req.urgency_level >= 3 else 'new_request',
            staffing_request_id=req.id,
            request_title=req.title,
            request_city=req.city,
            request_date=req.work_date,
            created_at=row.created_at,
        ))

    # Assigned / cancelled — from assignments for this worker
    assignment_rows = db.scalars(
        select(Assignment).where(Assignment.worker_user_id == worker_id)
    ).all()
    for row in assignment_rows:
        req = db.get(StaffingRequest, row.staffing_request_id)
        if req is None:
            continue
        feed.append(NotificationFeedItem(
            id=f'assignment-{row.id}',
            type='cancelled' if row.status == 'cancelled' else 'assigned',
            staffing_request_id=req.id,
            request_title=req.title,
            request_city=req.city,
            request_date=req.work_date,
            created_at=row.assigned_at,
        ))

    # Not selected — worker accepted but request was assigned to someone else
    not_selected_rows = db.scalars(
        select(RequestResponse)
        .where(
            RequestResponse.worker_user_id == worker_id,
            RequestResponse.status == 'accepted',
        )
        .join(StaffingRequest, RequestResponse.staffing_request_id == StaffingRequest.id)
        .where(
            StaffingRequest.status == 'assigned',
            StaffingRequest.assigned_worker_user_id != worker_id,
        )
    ).all()
    for row in not_selected_rows:
        req = db.get(StaffingRequest, row.staffing_request_id)
        if req is None:
            continue
        feed.append(NotificationFeedItem(
            id=f'not-selected-{row.id}',
            type='not_selected',
            staffing_request_id=req.id,
            request_title=req.title,
            request_city=req.city,
            request_date=req.work_date,
            created_at=row.responded_at or req.updated_at,
        ))

    feed.sort(key=lambda x: x.created_at, reverse=True)
    return {'items': feed}
