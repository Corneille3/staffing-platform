"""Observability instrumentation (SPEC_OBSERVABILITY PR1).

The property under test is the spec's first non-goal turned into a rule:
instrumentation observes, it never changes what a code path does. So besides
"the counter moved", these tests break the metrics layer on purpose and
check that the request still answers.
"""
import json
import logging

import pytest
from prometheus_client import REGISTRY

from app.core import metrics
from app.core.logging import JsonFormatter, RequestIdFilter
from app.core.request_id import request_id_var
from app.tests.test_twilio_webhook import (  # noqa: F401 — anon_client is a fixture
    PHONE, WEBHOOK, _claimable, _signed, anon_client,
)


def _sample(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels or None) or 0.0


# ── the webhook claim (acceptance criterion 4) ───────────────────────────────

def test_a_webhook_claim_moves_the_reply_counter_and_time_to_fill(anon_client, db_session, seed):
    seed.worker_b.phone = PHONE
    db_session.flush()
    _claimable(db_session, seed, seed.worker_b)
    claimed_before = _sample('staffig_sms_claim_replies_total', outcome='claimed')
    filled_before = _sample('staffig_time_to_fill_seconds_count')

    form = {'From': PHONE, 'Body': '1'}
    resp = anon_client.post(WEBHOOK, data=form, headers=_signed(anon_client, form))

    assert resp.status_code == 200, resp.text
    assert _sample('staffig_sms_claim_replies_total', outcome='claimed') == claimed_before + 1
    assert _sample('staffig_time_to_fill_seconds_count') == filled_before + 1


def test_replies_are_counted_by_what_they_led_to(anon_client, db_session, seed):
    seed.worker_b.phone = PHONE
    db_session.flush()
    before = {
        outcome: _sample('staffig_sms_claim_replies_total', outcome=outcome)
        for outcome in ('too_late', 'invalid', 'opted_out', 'opted_in')
    }

    def text(body: str, phone: str = PHONE) -> None:
        form = {'From': phone, 'Body': body}
        assert anon_client.post(WEBHOOK, data=form, headers=_signed(anon_client, form)).status_code == 200

    text('1')                       # nothing was offered: too late
    text('bonjour')                 # not a command
    text('1', '+15145559999')       # a number we do not know
    text('STOP')
    text('START')

    def moved(outcome: str) -> float:
        return _sample('staffig_sms_claim_replies_total', outcome=outcome) - before[outcome]

    assert (moved('too_late'), moved('invalid'), moved('opted_out'), moved('opted_in')) == (1, 2, 1, 1)


def test_a_broken_metrics_helper_does_not_fail_the_request(anon_client, db_session, seed, monkeypatch):
    """A metrics outage must not break a claim."""
    seed.worker_b.phone = PHONE
    db_session.flush()
    request = _claimable(db_session, seed, seed.worker_b)

    def boom(*args, **kwargs):
        raise RuntimeError('metrics backend is on fire')

    monkeypatch.setattr(metrics.SMS_CLAIM_REPLIES, 'labels', boom)
    monkeypatch.setattr(metrics.TIME_TO_FILL, 'observe', boom)
    monkeypatch.setattr(metrics.NOTIFICATIONS, 'labels', boom)

    form = {'From': PHONE, 'Body': '1'}
    resp = anon_client.post(WEBHOOK, data=form, headers=_signed(anon_client, form))

    assert resp.status_code == 200, resp.text
    db_session.refresh(request)
    assert request.assigned_worker_user_id == seed.worker_b.id   # the shift was still taken


def test_every_helper_swallows_its_own_failure(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError('nope')

    for metric in (metrics.NOTIFICATIONS, metrics.SMS_CLAIM_REPLIES, metrics.CLOCK_EVENTS, metrics.SCHEDULER_SWEEP):
        monkeypatch.setattr(metric, 'labels', boom)
    monkeypatch.setattr(metrics.TIME_TO_FILL, 'observe', boom)
    monkeypatch.setattr(metrics.REQUESTS_UNFILLED, 'set', boom)

    metrics.record_notification('sms', 'sent')
    metrics.record_sms_reply('claimed')
    metrics.record_clock_event('in', True)
    metrics.record_time_to_fill(None)
    metrics.set_requests_unfilled(3)
    with metrics.time_sweep('expiry'):
        pass


def test_a_failing_job_still_raises_through_the_sweep_timer():
    """The timer protects the measurement, not the job: the scheduler must
    still see (and log) a sweep that failed."""
    before = _sample('staffig_scheduler_sweep_seconds_count', job='noshow')
    with pytest.raises(ValueError):
        with metrics.time_sweep('noshow'):
            raise ValueError('sweep broke')
    assert _sample('staffig_scheduler_sweep_seconds_count', job='noshow') == before + 1


# ── the helpers ──────────────────────────────────────────────────────────────

def test_notifications_and_clock_events_are_labelled():
    sent = _sample('staffig_notifications_total', channel='push', status='sent')
    skipped = _sample('staffig_notifications_total', channel='push', status='skipped')
    metrics.record_notification('push', 'sent', 3)
    metrics.record_notification('push', 'skipped', 0)   # nothing to count
    assert _sample('staffig_notifications_total', channel='push', status='sent') == sent + 3
    assert _sample('staffig_notifications_total', channel='push', status='skipped') == skipped

    before = {geo: _sample('staffig_clock_events_total', kind='in', geo_ok=geo) for geo in ('true', 'false', 'unknown')}
    metrics.record_clock_event('in', True)
    metrics.record_clock_event('in', False)
    metrics.record_clock_event('in', None)
    for geo in before:
        assert _sample('staffig_clock_events_total', kind='in', geo_ok=geo) == before[geo] + 1


def test_channels_count_what_they_did(monkeypatch):
    from app.core.config import settings
    from app.notifications.email_service import EmailMessage, EmailNotificationService
    from app.notifications.sms_service import SmsNotificationService

    monkeypatch.setattr(settings, 'twilio_account_sid', '')
    monkeypatch.setattr(settings, 'smtp_host', '')
    sms = _sample('staffig_notifications_total', channel='sms', status='skipped')
    email = _sample('staffig_notifications_total', channel='email', status='skipped')

    SmsNotificationService().send('+15145550001', 'hello')
    EmailNotificationService().send(EmailMessage(to_email='a@example.org', subject='s', body='b'))

    assert _sample('staffig_notifications_total', channel='sms', status='skipped') == sms + 1
    assert _sample('staffig_notifications_total', channel='email', status='skipped') == email + 1


# ── the app's public port ────────────────────────────────────────────────────

def test_metrics_are_not_served_on_the_app_port(apf_client):
    """The app is public through Cloudflare (acceptance criterion 2)."""
    assert apf_client.get('/metrics').status_code == 404
    assert apf_client.get('/api/v1/metrics').status_code == 404


def test_http_requests_are_instrumented(apf_client):
    apf_client.get('/health')
    names = {metric.name for metric in REGISTRY.collect()}
    assert 'http_request_duration_seconds' in names


def test_the_metrics_server_never_raises_and_can_be_turned_off(monkeypatch):
    monkeypatch.setattr(metrics, '_server_started', False)
    assert metrics.start_metrics_server(0) is False

    def taken(port):
        raise OSError('address already in use')

    monkeypatch.setattr(metrics, 'start_http_server', taken)
    assert metrics.start_metrics_server(9091) is False   # logged, not raised


# ── request id + JSON logs (acceptance criterion 3) ──────────────────────────

def test_every_response_carries_a_request_id(apf_client):
    generated = apf_client.get('/health').headers['x-request-id']
    assert len(generated) == 32 and generated != apf_client.get('/health').headers['x-request-id']

    assert apf_client.get('/health', headers={'X-Request-ID': 'trace-abc.123'}).headers['x-request-id'] == 'trace-abc.123'
    # Something that is not an id is not echoed into logs and headers.
    hostile = apf_client.get('/health', headers={'X-Request-ID': 'x' * 200}).headers['x-request-id']
    assert hostile != 'x' * 200 and len(hostile) == 32
    # A refused request has one too.
    assert 'x-request-id' in apf_client.get('/api/v1/platform/overview').headers


def _formatted(record: logging.LogRecord) -> dict:
    RequestIdFilter().filter(record)
    return json.loads(JsonFormatter().format(record))


def test_log_lines_are_json_with_the_request_id_and_extras():
    token = request_id_var.set('req-42')
    try:
        record = logging.LogRecord('app.demo', logging.INFO, __file__, 1, 'Sent to %s', ('Mael',), None)
        record.tenant = 'apf'
        line = _formatted(record)
    finally:
        request_id_var.reset(token)

    assert line['level'] == 'INFO' and line['logger'] == 'app.demo'
    assert line['message'] == 'Sent to Mael'
    assert line['request_id'] == 'req-42' and line['tenant'] == 'apf'
    assert line['ts'].endswith('+00:00')


def test_log_lines_outside_a_request_and_with_an_exception():
    plain = _formatted(logging.LogRecord('app.scheduler', logging.INFO, __file__, 1, 'tick', (), None))
    assert 'request_id' not in plain

    try:
        raise ValueError('boom')
    except ValueError:
        import sys
        record = logging.LogRecord('app.demo', logging.ERROR, __file__, 1, 'failed', (), sys.exc_info())
    line = _formatted(record)
    assert 'ValueError: boom' in line['exception']
    # One object per line, whatever the traceback holds.
    assert '\n' not in JsonFormatter().format(record)

    odd = logging.LogRecord('app.demo', logging.INFO, __file__, 1, 'odd', (), None)
    odd.thing = object()
    assert 'thing' in _formatted(odd)   # an unserialisable extra does not break the line


# ── Sentry (acceptance criterion 5) ──────────────────────────────────────────

def test_sentry_stays_off_without_a_dsn(monkeypatch):
    import sentry_sdk

    from app import main
    from app.core.config import settings

    calls = []
    monkeypatch.setattr(sentry_sdk, 'init', lambda **kwargs: calls.append(kwargs))
    # Not caplog: an earlier test's alembic `fileConfig` disables the loggers
    # that already existed, so what `app.main` logs is read at the source.
    said = []
    monkeypatch.setattr(main.logger, 'info', lambda message, *args: said.append(message % args))

    monkeypatch.setattr(settings, 'sentry_dsn', '')
    main._init_sentry()
    assert calls == [] and said == ['Sentry disabled (no SENTRY_DSN)']

    monkeypatch.setattr(settings, 'sentry_dsn', 'https://key@o0.ingest.sentry.io/0')
    monkeypatch.setattr(settings, 'git_sha', 'abc1234')
    main._init_sentry()
    assert len(calls) == 1
    assert calls[0]['release'] == 'abc1234' and calls[0]['traces_sample_rate'] == 0
    assert calls[0]['environment'] == settings.app_env
    assert 'release=abc1234' in said[-1]
    # Spec §1d: `send_default_pii` stays at its default (off) — Sentry must not
    # receive IP addresses, cookies or request bodies of care workers.
    assert not calls[0].get('send_default_pii', False)
