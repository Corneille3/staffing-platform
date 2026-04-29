from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.models.request_notification import RequestNotification
from app.schemas.notification import NotificationRead

router = APIRouter()


@router.get('')
def list_notifications(db: Session = Depends(get_db_session)) -> dict[str, list[NotificationRead]]:
    notifications = list(
        db.scalars(select(RequestNotification).order_by(RequestNotification.created_at.desc())).all()
    )
    return {'items': [NotificationRead.model_validate(item) for item in notifications]}
