"""Logging — one JSON object per line (SPEC_OBSERVABILITY PR1, §1c).

Stdlib only. Existing call sites are untouched: they inherit the formatter.
Every record carries the current `request_id` (see core/request_id.py), so
the lines of one HTTP request can be pulled together in Loki.
"""
import json
import logging
import sys
from datetime import datetime, timezone

from app.core.config import settings
from app.core.request_id import current_request_id

# Attributes every LogRecord has; anything else was passed through `extra=`.
# `color_message` is uvicorn's ANSI-coloured duplicate of the message.
_STANDARD = frozenset(vars(logging.LogRecord('', 0, '', 0, '', (), None))) | {
    'message', 'asctime', 'taskName', 'color_message',
}


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, 'request_id'):
            record.request_id = current_request_id()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            'ts': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec='milliseconds'),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        request_id = getattr(record, 'request_id', None)
        if request_id:
            payload['request_id'] = request_id
        for key, value in record.__dict__.items():
            if key not in _STANDARD and key != 'request_id' and not key.startswith('_'):
                payload[key] = value
        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)
        if record.stack_info:
            payload['stack'] = self.formatStack(record.stack_info)
        # default=str: a log call must never fail on an odd `extra` value.
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Uvicorn installs its own plain-text handlers before the app is imported:
    # send its loggers (access lines included) through the root handler too.
    for name in ('uvicorn', 'uvicorn.error', 'uvicorn.access'):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers[:] = []
        uvicorn_logger.propagate = True
