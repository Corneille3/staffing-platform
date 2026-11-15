"""Public lead intake — SPEC_PLATFORM_LEADS §5 / §14.

The one route of the pipeline with no Clerk identity: a marketing site's
*server* route posts a demo request here. It is not called from a browser, so
there is no CORS to open; authenticity is a shared secret, and the visitor's
IP is forwarded by the site for the per-IP limit (the socket peer is the
site's host, not the visitor).

Any site holding the secret can post — the form's home is free to move
(kouamvision.com today, a dedicated StaffiG site later); `site` says which.
"""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.core.config import settings
from app.core.rate_limit import SlidingWindowLimiter
from app.schemas.platform_leads import PublicLeadIntake, PublicLeadIntakeResult
from app.services.platform_lead_service import receive_public_intake

router = APIRouter()

# 5 requests per hour per visitor (§11). In memory on purpose — see rate_limit.
intake_limiter = SlidingWindowLimiter(limit=5, window_seconds=3600)


def _require_intake_secret(x_intake_secret: str | None = Header(default=None)) -> None:
    expected = settings.leads_intake_secret
    if not expected:
        # Not configured: the route does not exist in this environment.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not Found')
    if not x_intake_secret or not hmac.compare_digest(x_intake_secret.encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden')


@router.post(
    '/leads/intake',
    status_code=status.HTTP_201_CREATED,
    response_model=PublicLeadIntakeResult,
    dependencies=[Depends(_require_intake_secret)],
)
def lead_intake(
    payload: PublicLeadIntake,
    x_visitor_ip: str | None = Header(default=None, max_length=64),
    db: Session = Depends(get_db_session),
) -> PublicLeadIntakeResult:
    # A caller that forwards no IP shares one bucket per site.
    key = x_visitor_ip.strip() if x_visitor_ip and x_visitor_ip.strip() else f'site:{payload.site or "unknown"}'
    if not intake_limiter.allow(key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many requests. Try again later.',
        )
    receive_public_intake(db, payload)
    # Nothing about the lead goes back: the caller learns it was received.
    return PublicLeadIntakeResult()
