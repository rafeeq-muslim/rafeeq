# Rafeeq API. Build context: repository root (needs content/ and data/).
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
WORKDIR /srv/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY content/ /srv/content/
COPY data/hisnmuslim/raw/ /srv/data/hisnmuslim/raw/
ENV PATH="/srv/backend/.venv/bin:$PATH" CONTENT_DIR=/srv/content HISNMUSLIM_DIR=/srv/data/hisnmuslim
RUN useradd --system --uid 10001 rafeeq && chown -R rafeeq /srv
USER rafeeq
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=4).status==200 else 1)"
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
