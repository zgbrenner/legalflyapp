"""Application settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    legalfly_demo_mode: bool = True
    legalfly_api_host: str = "0.0.0.0"
    legalfly_api_port: int = 8000
    legalfly_cors_origins: str = "http://localhost:3000"
    legalfly_max_text_chars: int = 4000
    legalfly_log_raw_text: bool = False
    legalfly_seed: int = 42
    legalfly_data_dir: str = "data"
    legalfly_models_dir: str = "models"
    legalfly_results_dir: str = "results"
    legalfly_encoder: str = "hashing"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.legalfly_cors_origins.split(",") if o.strip()]

    @property
    def repo_root(self) -> Path:
        return REPO_ROOT


@lru_cache
def get_settings() -> Settings:
    return Settings()