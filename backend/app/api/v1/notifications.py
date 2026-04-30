from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.scope import AccessScope, get_access_scope
from app.models.request_notification import RequestNotification
from app.models.staffing_request import StaffingRequest
from app.schemas.notification import NotificationRead

router = APIRouter()


@router.get('')
def list_notifications(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[NotificationRead]]:
    stmt = select(RequestNotification).order_by(RequestNotification.created_at.desc())

    if scope.is_apf:
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
        # Worker — only their own.
        stmt = stmt.where(RequestNotification.worker_user_id == scope.user.id)
        items = list(db.scalars(stmt).all())

    return {'items': [NotificationRead.model_validate(item) for item in items]}
