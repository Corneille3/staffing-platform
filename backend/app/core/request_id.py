"""X-Request-ID — one id per HTTP request, carried into every log line.

A pure ASGI middleware (not BaseHTTPMiddleware: that one runs the endpoint
in another task, where a contextvar set here would not be visible to the
handler's own log calls).
"""
from __future__ import annotations

import re
from contextvars import ContextVar
from uuid import uuid4

HEADER = 'x-request-id'
# An id we were handed is only kept when it looks like one — it goes into
# logs and back into a response header.
_SAFE = re.compile(r'^[A-Za-z0-9._-]{1,64}$')

request_id_var: ContextVar[str | None] = ContextVar('request_id', default=None)


def current_request_id() -> str | None:
    return request_id_var.get()


class RequestIdMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        incoming = None
        for name, value in scope.get('headers') or ():
            if name == HEADER.encode():
                incoming = value.decode('latin-1')
                break
        request_id = incoming if incoming and _SAFE.match(incoming) else uuid4().hex
        token = request_id_var.set(request_id)

        async def send_with_id(message) -> None:
            if message['type'] == 'http.response.start':
                headers = [(k, v) for k, v in message.get('headers', []) if k.lower() != HEADER.encode()]
                headers.append((HEADER.encode(), request_id.encode()))
                message = {**message, 'headers': headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            request_id_var.reset(token)
