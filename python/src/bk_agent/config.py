from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_token: SecretStr | None = None
    gateway_service_token: SecretStr | None = None
    delegation_public_key: str | None = None
    deepseek_api_key: SecretStr | None = None
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"
    gateway_base_url: str = "http://localhost:3000"
    model_timeout_seconds: float = 20
    gateway_timeout_seconds: float = 5
