import json
import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _load_aws_secrets() -> None:
    """Pull app config from AWS Secrets Manager when APP_ENV_SECRET_NAME is set."""
    secret_name = os.environ.get("APP_ENV_SECRET_NAME")
    region = os.environ.get("AWS_REGION", "ca-central-1")
    if not secret_name:
        return
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_name)
        for key, value in json.loads(response["SecretString"]).items():
            os.environ.setdefault(key.upper(), str(value))
    except Exception as exc:
        print(f"[config] AWS Secrets Manager load skipped: {exc}")


_load_aws_secrets()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', case_sensitive=False)

    app_env: str = 'dev'
    app_name: str = 'apf-staffing-platform'
    api_v1_prefix: str = '/api/v1'
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/apf_staffing'
    clerk_publishable_key: str | None = None
    clerk_secret_key: str | None = None
    clerk_issuer_url: str | None = None
    clerk_jwks_url: str | None = None
    dev_auth_bypass: bool = True
    allowed_origins: list[str] | str = 'http://localhost:3000'
    log_level: str = 'INFO'
    # Tier-0 2FA gate (PLATFORM_HANDOFF §1). Clerk MFA is a paid (Pro)
    # feature on production instances — set false to relax the gate until
    # the Clerk plan supports TOTP enrollment. Role gates still apply.
    platform_mfa_enforced: bool = True
    # Shared secret of the public lead intake (SPEC_PLATFORM_LEADS §14). The
    # marketing site's server route sends it in X-Intake-Secret. Blank = the
    # intake route answers 404, i.e. it does not exist in that environment.
    leads_intake_secret: str = ''

    smtp_host: str = ''
    smtp_port: int = 1025
    smtp_from: str = 'Staffig <noreply@staffig.kouamvision.com>'
    smtp_username: str = ''
    smtp_password: str = ''
    smtp_use_tls: bool = False

    twilio_account_sid: str = ''
    twilio_auth_token: str = ''
    twilio_from_number: str = ''
    # Broadcast SMS gate (2026-06-10 decision): new-shift broadcasts text only
    # when urgent (level >= 3) or the shift starts within this many hours.
    # Confirmations/cancellations always text.
    sms_broadcast_lead_hours: int = 24
    # How far back an inbound "1" reply may claim: the newest NOTIFIED
    # response within this window wins. Consumed by the reply-to-claim
    # webhook (spec Feature 1 step 2) — declared here with the rest of the
    # SMS config so the two land together.
    sms_claim_window_hours: int = 6
    sms_inbound_per_minute: int = 10

    # ── attendance (check-in/out, SPEC_CHECKOUT_HOURS) ──
    # Geofence starts permissive: outside-radius stamps geo_ok=False in the
    # audit payload and flags the UI, but never blocks — a GPS glitch must not
    # leave a worker standing outside unable to start a shift. Flip
    # geofence_enforce once the geo_ok=False rate is known.
    geofence_default_radius_m: int = 250
    geofence_enforce: bool = False
    # A CONFIRMED assignment counts as "not checked in" this many minutes
    # after its scheduled start — the operational absence signal.
    checkin_grace_minutes: int = 15
    # Check-out reminder fires this long after scheduled end — right when a
    # forgotten tap is still fixable from the parking lot (SPEC_NOSHOW §B2).
    checkout_reminder_delay_minutes: int = 10
    # A worker may still tap "Done" this long after the scheduled end — the
    # reminder above fires at +10, the parking-lot tap lands soon after. Past
    # it, only the coordinator's hours correction can close the shift. Check-in
    # gets no such window: arriving after the end is not an arrival (finding
    # #16, 2026-09-05 — a post-shift Start/Done pair produced a 0 h payroll
    # row). The worker Horaire mirrors this constant client-side.
    checkout_cutoff_minutes: int = 60
    # A corrected check-in→check-out window longer than this is a typo, not a
    # shift.
    max_shift_hours: int = 24

    # Web Push (PWA). Leave blank to disable — the worker UI hides the toggle
    # when the public-key endpoint returns empty. Generate a pair with
    # `python -m app.scripts.generate_vapid_keys`; both keys are base64url.
    vapid_public_key: str = ''
    vapid_private_key: str = ''
    vapid_subject: str = 'mailto:noreply@staffig.kouamvision.com'

    # ── background scheduler (replacement sweep + nightly reliability) ──
    # In-process daemon thread (decision 2026-06-10: no new infra/deps; the
    # single-uvicorn-worker entrypoint means exactly one runner per container).
    scheduler_enabled: bool = True
    replacement_sweep_interval_seconds: int = 300
    # Escalate a still-unfilled release/absence to the coordinator when the
    # shift starts within this many minutes (one email per request).
    replacement_escalation_lead_minutes: int = 60
    reliability_recompute_hour_utc: int = 7  # ~02:00–03:00 in Québec
    # Shift work_date/start_time are stored naive — Québec wall clock as
    # entered. Every "how soon is this shift" comparison interprets them in
    # this zone (treating them as UTC would skew expiry/escalation by ~4-5 h).
    shift_timezone: str = 'America/Toronto'

    @field_validator('app_env')
    @classmethod
    def validate_env(cls, value: str) -> str:
        allowed = {'dev', 'prod', 'test'}
        if value not in allowed:
            raise ValueError(f'app_env must be one of {allowed}')
        return value

    @field_validator('allowed_origins', mode='before')
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [item.strip() for item in value.split(',') if item.strip()]


settings = Settings()
