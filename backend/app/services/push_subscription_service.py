from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.push_subscription import PushSubscription
from app.schemas.push import PushSubscriptionCreate


class PushSubscriptionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def subscribe(self, user_id: UUID, payload: PushSubscriptionCreate) -> PushSubscription:
        """Upsert by endpoint: the browser hands back the same endpoint on
        re-subscribe, and a device that switched accounts must follow its
        current user — never notify the previous one."""
        subscription = self.db.scalar(
            select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
        )
        if subscription is None:
            subscription = PushSubscription(id=uuid4(), endpoint=payload.endpoint)
            self.db.add(subscription)
        subscription.user_id = user_id
        subscription.p256dh = payload.keys.p256dh
        subscription.auth = payload.keys.auth
        subscription.user_agent = (payload.user_agent or '')[:255] or None
        self.db.commit()
        self.db.refresh(subscription)
        return subscription

    def unsubscribe(self, user_id: UUID, endpoint: str) -> bool:
        subscription = self.db.scalar(
            select(PushSubscription).where(
                PushSubscription.endpoint == endpoint,
                PushSubscription.user_id == user_id,
            )
        )
        if subscription is None:
            return False
        self.db.delete(subscription)
        self.db.commit()
        return True
