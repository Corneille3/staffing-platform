"""Provider webhooks.

These routes are deliberately NOT mounted under the authenticated api_router —
Twilio has no Clerk JWT. Authenticity comes from the request signature instead,
so every handler here must validate before it touches the database.
"""
from __future__ import annotations

import logging
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


def _twiml(message: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(message)}</Message></Response>'


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

    reply = InboundSmsService(db).handle(
        from_number=params.get('From', ''),
        body=params.get('Body', ''),
        message_sid=params.get('MessageSid'),
    )
    return Response(content=_twiml(reply), media_type='application/xml')
