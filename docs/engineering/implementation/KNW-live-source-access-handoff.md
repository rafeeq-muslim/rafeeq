# Claude Handoff — Live Source Access, Version 3

## Placement

Locate the repository root containing `frontend/package.json` and `backend/pyproject.toml`.

Place the attached PRD at:

```text
docs/domains/knowledge/features/PRD-LIVE-SOURCE-PRIORITY-AND-FALLBACK.md
```

Preserve the existing glossary KNW-03 feature. The filename is retained from an earlier delivery; VERSION 3 CONTENT governs. It does not require priority ordering or a minimum of two sources.

## Message to Claude

```text
Implement VERSION 3 of PRD-LIVE-SOURCE-PRIORITY-AND-FALLBACK.md against the current Rafeeq checkout.

The user has explicitly corrected the earlier interpretation:
- Answers may use ANY suitable approved source, including ONE source only.
- IslamQA, Ibn Baz, and the user's Islamic Content Encyclopedia must actually be connected and usable by the chatbot.
- Keep the requested live backend retrieval. Search the configured language-compatible connectors within bounded parallel collection, and use whatever evidence adequately supports the answer.
- Do NOT require two or three source families, mandatory IslamQA citations, equal source shares, or a fixed primary/fallback ordering.
- A failure or empty result from one source must not block a verified answer supported by another source.
- Only show sources actually used to support the answer.

This version supersedes conflicting minimum-source and priority rules in previous PRD/handoff versions. Remove those restrictions from any already implemented code, prompts, schemas, and tests. Preserve actual source verification, safety, submission parity, timeouts, and retry fixes.

Discover real connector configurations and search/fetch schemas. Do not invent endpoints or tool names. Verify each connector from the backend deployment environment, not just Claude's MCP tools. Identify the actual encyclopedia connector rather than assuming islamhouse_enc is the same service. If missing, complete independent work and report exactly what remains unidentified or unavailable.

Follow the PRD implementation sequence and A01-A26 tests. Ensure single-source answers pass when supported and multi-source answers fail when unsupported. Do not silently use old local-only results as proof of live retrieval. Distinguish mock verification from live tests.

Write the implementation report at:
docs/engineering/implementation/KNW-live-source-access-report.md

Include actual connectors/versions, changed files, exact commands/results, live search/fetch evidence, latency/cost/quality, outstanding dependencies, and rollout/rollback steps. Do not claim full integration until the required connectors have been verified.
```

## للمستخدم

أرسل هذا الملف مع PRD الإصدار 3 والمشروع الحالي. هذا هو التوضيح النهائي: مصدر واحد مناسب يكفي؛ المهم إتاحة الإسلام سؤال وجواب وابن باز وقراءة الموسوعة فعليًا، دون إلزام بإظهارها جميعًا أو بترتيبها في كل جواب.
