# Overnight build: status and handoff

Owner of this file: Claude (product engineer). Updated: 2026-10-05 ~20:45 (server time).

## Done
- Musallam's KNW docs (implementation plan + KNW-02..09) committed under his name (Musallam-1 noreply), PR #4 merged.
- Mohannad's follow-up (LRN-05, 07, 09, 10, KNW-10, MOT-09) PR #5 merged (features.md conflict resolved).
- PR #3 (PRC-01/04/05 docs + Hisn al-Muslim data) merged (decisions.md conflict: kept both).
- OpenRouter key stored server-side only: /home/naser/.config/rafeeq/secrets.env (600). Key limit $50, app cap to enforce: $10.
- Model price scan done (OpenRouter, Oct 5): gemma-4-31b-it $0.09/$0.34 per M; gemma-4-26b-a4b-it $0.076/$0.255; deepseek-v4-pro $0.209/$0.418; qwen3.8-flash $0.15/$0.47; embeddings baai/bge-m3 $0.01/M (Musallam's plan).
- Server facts: Docker 29 + compose v5; nginx wildcard router *.nan.sa via /home/naser/claude-works/nginx-app-router (skill add-app); 24 cores, 122 GB RAM.
- Scrollcraft skill unpacked at scratchpad/scrollcraft (landing page = final step).

## Blocked / needs the user
- CronCreate recurring GitHub watcher was refused by the auto-mode classifier ("Create Unsafe Agents"). Do not retry; report it.

## Read so far (PRDs)
rules.md, product.md, domains.md, features.md, decisions.md, LRN-01/02/03/04/05/07/09/10, MOT-02/03/05/06/07/08/09, KNW-01/10 + KNW implementation plan + KNW-02..09.

## Next
1. Read remaining: PRC-01/04/05, PLT-02, glossary, sources, context, personas, companion/platform/practice READMEs, research index.
2. Write docs/engineering/plan.md (architecture, phases, per-feature implementation plans), docs/engineering/decisions-for-review.md, docs/engineering/conflicts.md.
3. Write missing PRDs (CMP-01, CMP-02, CMP-05, PLT-01, PLT-03, PLT-05, PLT-06, PRC-07...) in the team format, marked as Claude drafts.
4. Scaffold: frontend/ (move design-system in), backend/ (FastAPI + Postgres/pgvector), docker compose, rafeeq.nan.sa via router, GH Actions (CI + deploy via self-hosted runner, push to main only).
5. Build P1 end to end, then P2/P3, AI agents, KNW-04 eval, landing page (scrollcraft) last.
