"""Provider webhooks.

These routes are deliberately NOT mounted under the authenticated api_router —
Twilio has no Clerk JWT. Authenticity comes from the request signature instead,
so every handler here must validate before it touches the database.
"""
from __future__ import annotations

import logging
from collections import defaultdict, deque
from time import monotonic
from urllib.parse import parse_qsl
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.core.config import settings
from app.notifications.twilio_signature import is_valid, public_url
from app.services.inbound_sms_service import InboundSmsService

logger = logging.getLogger(__name__)

router = APIRouter()

# Belt-and-braces above the signature check (spec 1.4): a compromised Twilio
# account could replay validly-signed messages. Sliding one-minute window per
# sender, in memory — multi-process drift just multiplies the ceiling by the
# worker count, which is fine for an abuse brake. Over-limit messages are
# DROPPED with a 200 + empty TwiML rather than 4xx: Twilio retries error
# statuses, and retrying is exactly what we don't want more of.
_rate_window: dict[str, deque[float]] = defaultdict(deque)


def _rate_limited(from_number: str) -> bool:
    now = monotonic()
    window = _rate_window[from_number]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.sms_inbound_per_minute:
        return True
    window.append(now)
    return False


def _twiml(message: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(message)}</Message></Response>'


_TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


@router.post('/twilio/sms')
async def inbound_sms(request: Request, db: Session = Depends(get_db_session)) -> Response:
    # Parsed by hand rather than via `request.form()`: that path needs the
    # python-multipart dependency, and Twilio only ever posts webhooks as
    # application/x-www-form-urlencoded. keep_blank_values matters — an empty
    # field is still part of the string Twilio signed, and dropping it turns
    # every such message into a spurious 403.
    raw = (await request.body()).decode('utf-8', errors='replace')
    params = dict(parse_qsl(raw, keep_blank_values=True))

    # Signed against the public HTTPS URL, not the http:// one Cloudflare
    # forwards us (see twilio_signature for why this bites).
    url = public_url(str(request.url), request.headers.get('X-Forwarded-Proto'))
    if not is_valid(
        settings.twilio_auth_token,
        url,
        params,
        request.headers.get('X-Twilio-Signature'),
    ):
        logger.warning('Rejected inbound SMS with bad signature from %s', params.get('From'))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Invalid signature')

    sender = params.get('From', '')
    if _rate_limited(sender):
        # Authenticated (signature passed) but too chatty. Acknowledge and
        # drop — no reply message, no DB write, nothing for a loop to feed on.
        logger.warning('Rate-limited inbound SMS from %s', sender)
        return Response(content=_TWIML_EMPTY, media_type='application/xml')

    reply = InboundSmsService(db).handle(
        from_number=params.get('From', ''),
        body=params.get('Body', ''),
        message_sid=params.get('MessageSid'),
    )
    return Response(content=_twiml(reply), media_type='application/xml')
