"""Errors a client can translate.

A plain HTTPException carries an English sentence. `coded()` adds a stable
code and the values the sentence was built from, so a bilingual screen can
show its own wording:

    {"detail": {"code": "lead.lost_needs_reason", "message": "…", "params": {}}}

`message` stays readable English for logs, curl and any client that does not
know the code.
"""
from typing import Any

from fastapi import HTTPException


def coded(status_code: int, code: str, message: str, **params: Any) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={'code': code, 'message': message, 'params': params},
    )
