"""Settings from the environment. No secret has a default value."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    public_url: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://rafeeq:rafeeq_dev@127.0.0.1:5442/rafeeq"

    jwt_secret: str = "dev-only-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 60

    # Content (lessons, cards, fixed replies) shipped with the repo.
    content_dir: Path = ROOT / "content"
    hisnmuslim_dir: Path = ROOT / "data" / "hisnmuslim"
    # Normalized source files (KNW-02). Kept outside the public repo; mounted read-only in production.
    corpus_dir: Path = Path.home() / ".local/share/rafeeq/corpus"

    # AI (OpenRouter). Budget is a hard cap on paid calls (product owner: $10).
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    ai_budget_usd: float = 10.0
    ai_model_main: str = "google/gemma-4-31b-it"
    ai_model_fast: str = "google/gemma-4-26b-a4b-it"
    ai_model_fallback: str = "deepseek/deepseek-v4-pro"
    ai_embedding_model: str = "baai/bge-m3"
    knw_search_k: int = 8
    knw_min_similarity: float = 0.0  # calibrated by KNW-04 (plan §5.5)
    knw_quote_max_words: int = 6
    knw_scripture_overlap_words: int = 6  # plan 4.6 check 7: 5 → 6 after the 2026-10-05 bake-off (docs/engineering/ai-agents.md)
    # Sources the answer path may retrieve from (islamqa waits for the owner's decision on its pending permission).
    knw_answer_sources: str = "quranenc,hadeethenc,islamhouse_enc,binbaz"
    knw_embed_job_limit: int = 2000  # passages embedded per scheduler run (0 disables the job)

    # Web Push (VAPID).
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:team@rafeeq.nan.sa"

    # Email for optional 2FA. Empty host = delivery not configured.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Rafeeq <no-reply@rafeeq.nan.sa>"

    # Bootstrap admin (created once if no admin exists).
    bootstrap_admin_username: str = ""
    bootstrap_admin_password: str = ""

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
