"""Staffig's own metrics (SPEC_OBSERVABILITY PR1, §1b) — one module.

The rule that matters: **instrumentation observes, it never alters a code
path's outcome.** Every helper below is wrapped by `_never_raises`: if the
metrics library misbehaves (bad label, registry trouble), the failure is
logged once at debug level and swallowed — a metrics outage must not break a
claim, a check-in or a notification.

Served on a private port (`start_metrics_server`), never on the app's port:
the app is published through Cloudflare and metrics must not be public.

Single-process uvicorn today (docker-entrypoint.sh runs it without
`--workers`), so the default in-memory registry is the whole truth. If
`--workers > 1` is ever added, this must move to prometheus_client's
multiprocess mode — each worker would otherwise expose its own counters.
"""
from __future__ import annotations

import functools
import logging
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Callable, Iterator, TypeVar

from prometheus_client import Counter, Gauge, Histogram, start_http_server

logger = logging.getLogger(__name__)

F = TypeVar('F', bound=Callable[..., None])

REQUESTS_UNFILLED = Gauge(
    'staffig_requests_unfilled',
    'Published requests still waiting for a substitute (open, notified or responses received).',
)
TIME_TO_FILL = Histogram(
    'staffig_time_to_fill_seconds',
    'Seconds from a request being created to its assignment being confirmed.',
    buckets=(300, 900, 1800, 3600, 7200, 14400, 43200, 86400),
)
NOTIFICATIONS = Counter(
    'staffig_notifications_total',
    'Notifications handed to a channel, by outcome.',
    ['channel', 'status'],
)
SMS_CLAIM_REPLIES = Counter(
    'staffig_sms_claim_replies_total',
    'Inbound SMS replies, by what they led to.',
    ['outcome'],
)
CLOCK_EVENTS = Counter(
    'staffig_clock_events_total',
    'Check-ins and check-outs, by geofence result.',
    ['kind', 'geo_ok'],
)
SCHEDULER_SWEEP = Histogram(
    'staffig_scheduler_sweep_seconds',
    'Duration of one scheduler job run.',
    ['job'],
    buckets=(0.1, 0.5, 1, 5, 15, 60),
)

# What `inbound_sms.action` (the receipt the handler writes) means as an
# outcome. The spec names four; the handler knows three more situations that
# are none of them, so they keep their own value rather than being miscounted.
_SMS_OUTCOMES = {
    'claimed': 'claimed',
    'lost_race': 'too_late',
    'nothing_open': 'too_late',
    'unknown_number': 'invalid',
    'help': 'invalid',
    'opted_out': 'opted_out',
    'opted_in': 'opted_in',
    'pending_approval': 'pending_approval',
    'overlap': 'overlap',
}


def _never_raises(func: F) -> F:
    @functools.wraps(func)
    def wrapper(*args, **kwargs) -> None:
        try:
            func(*args, **kwargs)
        except Exception:  # noqa: BLE001 — by design: observe, never break
            logger.debug('metrics helper %s failed', func.__name__, exc_info=True)

    return wrapper  # type: ignore[return-value]


@_never_raises
def record_notification(channel: str, status: str, count: int = 1) -> None:
    """`channel` sms | push | email; `status` sent | failed | skipped."""
    if count > 0:
        NOTIFICATIONS.labels(channel=channel, status=status).inc(count)


@_never_raises
def record_sms_reply(action: str) -> None:
    SMS_CLAIM_REPLIES.labels(outcome=_SMS_OUTCOMES.get(action, 'invalid')).inc()


@_never_raises
def record_clock_event(kind: str, geo_ok: bool | None) -> None:
    """`kind` in | out. `geo_ok` None = no position sent (recorded as unknown)."""
    label = 'unknown' if geo_ok is None else ('true' if geo_ok else 'false')
    CLOCK_EVENTS.labels(kind=kind, geo_ok=label).inc()


@_never_raises
def record_time_to_fill(created_at: datetime | None, assigned_at: datetime | None = None) -> None:
    if created_at is None:
        return
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    end = assigned_at or datetime.now(timezone.utc)
    TIME_TO_FILL.observe(max(0.0, (end - created_at).total_seconds()))


@_never_raises
def set_requests_unfilled(count: int) -> None:
    REQUESTS_UNFILLED.set(count)


@_never_raises
def _observe_sweep(job: str, seconds: float) -> None:
    SCHEDULER_SWEEP.labels(job=job).observe(seconds)


@contextmanager
def time_sweep(job: str) -> Iterator[None]:
    """Time one scheduler job. The job's own exceptions pass through
    untouched; only the measurement is protected."""
    start = time.monotonic()
    try:
        yield
    finally:
        _observe_sweep(job, time.monotonic() - start)


_server_started = False


def start_metrics_server(port: int) -> bool:
    """Serve the default registry on `port` (all interfaces *inside* the
    container; the host publishes it on 127.0.0.1 only). 0 disables it.
    Never raises: a taken port must not stop the API from starting."""
    global _server_started
    if port <= 0 or _server_started:
        return _server_started
    try:
        start_http_server(port)
        _server_started = True
        logger.info('Metrics server listening on :%s', port)
    except Exception:  # noqa: BLE001
        logger.exception('Metrics server could not start on :%s', port)
    return _server_started
