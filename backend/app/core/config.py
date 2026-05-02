from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
