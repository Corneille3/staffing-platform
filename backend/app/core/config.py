from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', case_sensitive=False)

    app_env: str = 'dev'
    app_name: str = 'apf-staffing-platform'
    api_v1_prefix: str = '/api/v1'
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/apf_staffing'
    cognito_region: str = 'ca-central-1'
    cognito_user_pool_id: str | None = None
    cognito_app_client_id: str | None = None
    cognito_issuer_url: str | None = None
    cognito_jwks_url: str | None = None
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

    @field_validator('cognito_issuer_url', mode='before')
    @classmethod
    def build_cognito_issuer_url(cls, value: str | None, info) -> str | None:
        if value:
            return value
        region = info.data.get('cognito_region')
        user_pool_id = info.data.get('cognito_user_pool_id')
        if region and user_pool_id:
            return f'https://cognito-idp.{region}.amazonaws.com/{user_pool_id}'
        return None

    @field_validator('cognito_jwks_url', mode='before')
    @classmethod
    def build_cognito_jwks_url(cls, value: str | None, info) -> str | None:
        if value:
            return value
        issuer = info.data.get('cognito_issuer_url')
        if issuer:
            return f'{issuer}/.well-known/jwks.json'
        return None


settings = Settings()
