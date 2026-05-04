from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "hbx_scraping.sqlite"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    user_agent: str = Field("HBX-Scraping/0.1 contato@hbxsystem.com.br", alias="HBX_SCRAPING_USER_AGENT")
    timeout_seconds: float = Field(10, alias="HBX_SCRAPING_TIMEOUT_SECONDS")
    concurrency: int = Field(5, alias="HBX_SCRAPING_CONCURRENCY")
    cache_ttl_hours: int = Field(24, alias="HBX_SCRAPING_CACHE_TTL_HOURS")
    max_discovery_results: int = Field(600, alias="HBX_SCRAPING_MAX_DISCOVERY_RESULTS")
    agenda_max_pages: int = Field(20, alias="HBX_AGENDA_MAX_PAGES")
    agenda_request_delay_ms: int = Field(500, alias="HBX_AGENDA_REQUEST_DELAY_MS")
    max_page_bytes: int = 1_500_000


@lru_cache
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
