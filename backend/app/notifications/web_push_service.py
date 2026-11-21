import json
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.metrics import record_notification
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

# Push notifications race against the user opening the app — a stale "new
# coverage" alert delivered hours later is noise, so cap time-to-live.
_PUSH_TTL_SECONDS = 12 * 3600


class WebPushService:
    """Web Push (PWA) delivery. Skips silently when VAPID keys are unset,
    mirroring SmsNotificationService's posture toward missing Twilio creds."""

    @property
    def enabled(self) -> bool:
        return bool(settings.vapid_private_key and settings.vapid_public_key)

    def send_to_user(self, db: Session, user_id: UUID, payload: dict) -> dict[str, int]:
        """Push ``payload`` to every device the user enabled. Endpoints the
        push service reports gone (404/410) are pruned. Never raises."""
        if not self.enabled:
            logger.info('Web Push not configured — skipping for user %s', user_id)
            record_notification('push', 'skipped')
            return {'sent': 0, 'pruned': 0, 'failed': 0}

        subscriptions = db.scalars(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        ).all()
        if not subscriptions:
            return {'sent': 0, 'pruned': 0, 'failed': 0}

        from pywebpush import WebPushException, webpush

        data = json.dumps(payload)
        sent = pruned = failed = 0
        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info={
                        'endpoint': subscription.endpoint,
                        'keys': {'p256dh': subscription.p256dh, 'auth': subscription.auth},
                    },
                    data=data,
                    vapid_private_key=settings.vapid_private_key,
                    # pywebpush mutates the claims dict (adds aud/exp) — pass a
                    # fresh one per call.
                    vapid_claims={'sub': settings.vapid_subject},
                    ttl=_PUSH_TTL_SECONDS,
                    # Everything we push is time-sensitive (a broadcast is a
                    # race; confirmations/cancellations change someone's day).
                    # Without this, Android Doze batches the message and it
                    # only lands when the user wakes the phone.
                    headers={'Urgency': 'high'},
                )
                sent += 1
            except WebPushException as exc:
                status = getattr(exc.response, 'status_code', None)
                if status in (404, 410):
                    db.delete(subscription)
                    pruned += 1
                    logger.info('Pruned dead push subscription %s (HTTP %s)', subscription.id, status)
                else:
                    failed += 1
                    logger.warning('Web Push failed for subscription %s: %s', subscription.id, exc)
            except Exception:
                failed += 1
                logger.exception('Web Push failed for subscription %s', subscription.id)
        if pruned:
            db.flush()
        # Per device. A pruned endpoint (the browser unsubscribed) was not a
        # delivery failure of ours: counted as skipped.
        record_notification('push', 'sent', sent)
        record_notification('push', 'failed', failed)
        record_notification('push', 'skipped', pruned)
        return {'sent': sent, 'pruned': pruned, 'failed': failed}
