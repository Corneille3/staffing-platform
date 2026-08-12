"""E.164 phone normalization.

Inbound SMS arrives from Twilio in strict E.164 (`+15145550001`), but
`users.phone` is free text a coordinator typed — `(514) 555-0001`,
`514-555-0001`, `1 514 555 0001`. Matching a reply to a person means both
sides have to agree on one shape, so we normalize on write and compare
normalized values on read.

Scope is deliberately North America (NANP): this is a Québec product, every
number in the system is +1, and a general-purpose parser (phonenumbers) is a
dependency we don't need. A number we can't confidently normalize is returned
unchanged rather than mangled — the caller treats a non-match as an unknown
number, which is the safe outcome.
"""
from __future__ import annotations

import re

_DIGITS = re.compile(r'\D')


def normalize_e164(raw: str | None) -> str | None:
    """Return `+1XXXXXXXXXX` for a NANP number, else the input trimmed.

    Returns None for empty input. Never raises — an unparseable number is a
    lookup miss, not an error.
    """
    if raw is None:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None

    digits = _DIGITS.sub('', trimmed)
    if len(digits) == 10:
        return f'+1{digits}'
    if len(digits) == 11 and digits.startswith('1'):
        return f'+{digits}'
    # Already E.164 with a non-NANP country code, or something we don't
    # recognize — hand it back rather than guessing.
    return f'+{digits}' if trimmed.startswith('+') else trimmed
