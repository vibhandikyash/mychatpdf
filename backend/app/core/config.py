from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    database_url: str = "sqlite+pysqlite:///./mychatpdf.db"
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    clerk_jwks_timeout_seconds: int = Field(default=5, ge=1)
    clerk_audience: str | None = None
    frontend_origin: str | AnyHttpUrl = "http://localhost:5173"

    wasabi_access_key_id: str | None = None
    wasabi_secret_access_key: str | None = None
    wasabi_bucket: str = "mychatpdf-local"
    wasabi_region: str = "us-east-1"
    wasabi_endpoint_url: str | None = None
    signed_url_ttl_seconds: int = Field(
        default=900,
        validation_alias="WASABI_SIGNED_URL_EXPIRES_SECONDS",
    )

    openai_api_key: str | None = None
    openai_embedding_model: str = "text-embedding-3-small"
    openai_embedding_dimensions: int | None = Field(default=None, ge=1)
    openai_chat_model: str = "gpt-4.1-mini"
    openai_chat_temperature: float | None = Field(default=None, ge=0, le=2)

    pinecone_api_key: str | None = None
    pinecone_index_name: str = "mychatpdf"
    pinecone_namespace: str = "local"

    max_upload_mb: int = Field(default=20, ge=1)
    max_pdf_pages: int = Field(default=300, ge=1)
    redis_url: str = "redis://localhost:6379/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
