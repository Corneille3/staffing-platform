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
