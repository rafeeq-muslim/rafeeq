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
    # Daily ceiling for answers and every other model call except the corpus
    # embedding job; resets at 00:00 UTC.
    ai_daily_budget_usd: float = 0.75
    # KNW-02 SC3: the corpus embedding job (agent "embed") has its own daily
    # ceiling, so a large run neither stalls behind answers nor blocks them.
    # The $10 total above still covers everything.
    ai_embed_daily_budget_usd: float = 1.00
    ai_model_main: str = "google/gemma-4-31b-it"
    ai_model_fast: str = "google/gemma-4-26b-a4b-it"
    ai_model_fallback: str = "deepseek/deepseek-v4-pro"
    ai_embedding_model: str = "baai/bge-m3"
    knw_search_k: int = 8
    knw_min_similarity: float = 0.0  # calibrated by KNW-04 (plan §5.5)
    knw_quote_max_words: int = 6
    knw_scripture_overlap_words: int = 6  # plan 4.6 check 7: 5 → 6 after the 2026-10-05 bake-off (docs/engineering/ai-agents.md)
    # Sources the answer path may retrieve from, parsed only by
    # app.knowledge.source_policy (KNW-02 SC1). islamqa is a main source by
    # the product owner's decision of 2026-10-06; its permission request is
    # still recorded as pending in docs/agents/sources.md.
    # KNW-02 R6 (owner, 2026-10-06): approved team lesson cards are an answer source.
    knw_answer_sources: str = "quranenc,hadeethenc,islamhouse_enc,binbaz,islamqa,rafeeq_cards"
    knw_embed_job_limit: int = 4000  # passages per scheduler run (0 disables); ≈ 7 min at the measured 6.7 s per 64 islamqa passages
    knw_embed_job_minutes: int = 10  # scheduler interval of the embedding job
    # Owner decision 2026-10-06: when two candidates from different sources
    # have fused (RRF) scores within this epsilon, the preferred source ranks
    # first. Not a quota; 0 disables it. 0.0006 ≈ one rank position in each
    # of the two channels at the top of the list (2 × (1/60 − 1/61) = 0.00055):
    # two passages of equal relevance differ by that much only because each
    # channel must put one of them first.
    # PRD live v3 §1, §7.2 (final user clarification, supersedes the near-tie
    # preference for islamqa): no site gets a preference by its name. The
    # mechanism stays for an explicit env value; empty disables it.
    knw_preferred_source: str = ""
    knw_near_tie_epsilon: float = 0.0006

    # KNW-01 reliability (docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md §14.5).
    ask_deadline_seconds: float = 45.0  # whole pipeline, server side; the app waits 50 s
    ask_max_external_calls: int = 8  # every model and embedding call of one question, retries included
    ask_max_retrieval_rounds: int = 2  # first round + one expansion
    ask_max_compose_rounds: int = 2  # first composition + one repair or recomposition
    ask_query_normalization_enabled: bool = True  # search-only canonical query (R2); evidence in the KNW-01 report
    ask_repair_enabled: bool = True  # one bounded repair, then every check again (R5); evidence in the KNW-01 report
    ask_approved_faq_enabled: bool = True  # R7: serves only entries approved by the Sharia reviewer; env false turns it off

    # PLT-09 organized home: approved, on by default (product owner's
    # instruction, 2026-10-06; PLT owner informed). PLT09_ORGANIZED_HOME=false
    # rolls back to the previous Home, «كل ما في رفيق», Discover and «حسابي».
    plt09_organized_home: bool = True

    # --- PRD-LIVE-SOURCE-PRIORITY-AND-FALLBACK v3 (knw-live-source-access) -------------
    # On by default (product owner's approval, 2026-10-06: docs/engineering/
    # decisions-for-review.md «Go-live approvals (2026-10-06)»).
    # `live-enabled-sources-any-sufficient-v3` also reads the connectors listed in
    # ASK_LIVE_SOURCES live at question time, in parallel; any one suitable source is
    # enough (no minimum, no mandatory source, no primary/fallback order).
    # Rollback: ASK_SOURCE_POLICY=local-index-v2 answers from the local index only
    # (KNW-01/02); ASK_LIVE_SOURCES= (empty) or a shorter list switches connectors off.
    # Details: docs/engineering/implementation/KNW-live-source-access-report.md.
    ask_source_policy: str = "live-enabled-sources-any-sufficient-v3"
    ask_live_sources: str = "islamqa,binbaz"  # names from app.knowledge.live_sources.registry
    # islamenc.com's robots.txt disallows /*/search for every agent: its search is
    # called only once the encyclopedia grants access in writing. A third party's
    # rule, not covered by the owner's go-live approval: stays off.
    ask_live_islamic_content_search_permitted: bool = False
    ask_live_deadline_seconds: float = 60.0  # §9: whole request in live mode (the app waits 65 s)
    ask_live_window_seconds: float = 20.0  # §9: one shared search + fetch window
    ask_live_max_calls_per_source: int = 4  # §9: transport calls per connector, retries included
    ask_live_max_calls: int = 16  # §9: transport calls per attempt
    ask_live_max_ai_calls: int = 6  # §9: model + embedding calls per attempt in live mode
    ask_live_records_per_source: int = 2  # records fetched in full per connector
    ask_live_chunks_per_record: int = 2  # most relevant parts of one record given to the composer
    ask_live_request_timeout_seconds: float = 8.0
    ask_live_user_agent: str = "RafeeqBot/1.0 (+https://rafeeq.nan.sa)"

    # --- KNW-06 library search (PRD-LIBRARY-LIVE-SEARCH, knw-06-library-live-search-build) ---
    # Its own allowlist: only islamic_content and islamhouse can ever be searched
    # (app.knowledge.library_search.LIBRARY_SOURCES); the chat settings above are
    # never read for it. LIBRARY_SEARCH_SOURCES may only switch a library source
    # off. The encyclopedia stays "not connected" until
    # ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED=true (the site's robots.txt).
    # Rollback: LIBRARY_SEARCH_ENABLED=false hides the search; the catalogue is untouched.
    library_search_enabled: bool = True
    library_search_sources: str = "islamic_content,islamhouse"
    library_search_window_seconds: float = 12.0  # PRD §8: whole backend window (the app waits 15 s)
    library_search_request_timeout_seconds: float = 8.0
    library_search_max_calls_per_source: int = 4  # PRD §8: per source per page, retries included
    library_search_max_calls: int = 8  # PRD §8: shared cap per page
    library_search_session_seconds: int = 300  # PRD §7: a search session ends after 5 minutes
    library_search_max_sessions: int = 2000  # memory bound; the oldest session goes first

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
