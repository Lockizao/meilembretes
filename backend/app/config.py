from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "development"

    database_url: str = "sqlite+aiosqlite:///./dev.db"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    job_secret_token: str = "change-me"

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claims_email: str = "admin@example.com"

    frontend_origin: str = "http://localhost:4200"

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
