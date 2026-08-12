"""Twilio webhook signature validation, SDK-free.

Twilio signs each webhook with HMAC-SHA1 over the full request URL followed by
every POST parameter, sorted by name and concatenated as `key + value` with no
separators, keyed on the account's auth token. The result is base64 and arrives
as `X-Twilio-Signature`.

Staying SDK-free matches `sms_service.py`, which talks to Twilio over plain
httpx. The whole algorithm is a dozen lines; a dependency for it isn't worth
the supply-chain surface.

**The Cloudflare trap:** Twilio signs the *public* HTTPS URL it was configured
with, but this app sits behind Cloudflare Flexible SSL, so the request arrives
over plain HTTP and `request.url` reads `http://…`. Rebuilding the signed
string from that URL yields a mismatch and a 403 loop that looks exactly like a
wrong auth token. We honour `X-Forwarded-Proto` and force https when the
configured public base says so.
"""
from __future__ import annotations

import hashlib
import hmac
from base64 import b64encode
from urllib.parse import urlparse, urlunparse


def expected_signature(auth_token: str, url: str, params: dict[str, str]) -> str:
    """The signature Twilio should have sent for this URL + form body."""
    payload = url
    for key in sorted(params):
        payload += key + (params[key] or '')
    digest = hmac.new(
        auth_token.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha1,
    ).digest()
    return b64encode(digest).decode('utf-8')


def public_url(raw_url: str, forwarded_proto: str | None) -> str:
    """The URL as Twilio saw it, not as the proxy handed it to us."""
    parsed = urlparse(raw_url)
    scheme = (forwarded_proto or parsed.scheme or 'https').split(',')[0].strip()
    return urlunparse(parsed._replace(scheme=scheme))


def is_valid(auth_token: str, url: str, params: dict[str, str], signature: str | None) -> bool:
    """Constant-time compare so a timing side channel can't leak the token."""
    if not auth_token or not signature:
        return False
    return hmac.compare_digest(expected_signature(auth_token, url, params), signature)
