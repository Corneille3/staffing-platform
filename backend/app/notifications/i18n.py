"""Locale selection for outbound email.

E2E bug #2: invitation emails mixed a French greeting with an English body.
For messages where we know the recipient's preferred language (invites set it on
the User), render a single locale. When the preference is "bilingual" — or
unknown / a tenant fallback — render both, French first, mirroring the shift
notifications in ``notification_dispatcher``.
"""
from __future__ import annotations

SEPARATOR = '\n---\n\n'


def localized(preferred_language: str | None, fr: str, en: str) -> str:
    """Pick the French text, the English text, or both (FR first)."""
    lang = (preferred_language or '').strip().lower()
    if lang == 'fr':
        return fr
    if lang == 'en':
        return en
    return f'{fr}{SEPARATOR}{en}'


def localized_subject(preferred_language: str | None, fr: str, en: str) -> str:
    """Like ``localized`` but for an email Subject — a single line. Bilingual
    joins with ' / ' (never the multi-line body SEPARATOR, which would mangle
    the header)."""
    lang = (preferred_language or '').strip().lower()
    if lang == 'fr':
        return fr
    if lang == 'en':
        return en
    return f'{fr} / {en}'
