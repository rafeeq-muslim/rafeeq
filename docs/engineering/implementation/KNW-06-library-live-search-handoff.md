# Claude Handoff — Library Live Search

Place `PRD-LIBRARY-LIVE-SEARCH.md` at:

```text
docs/domains/knowledge/features/PRD-LIBRARY-LIVE-SEARCH.md
```

Find the repository root containing frontend and backend. Link the PRD from the existing KNW-06 library specification and the knowledge domain README. Preserve those documents and the current library browsing behavior.

Corrected scope: library search uses only Islamic Content Encyclopedia and IslamHouse. Chatbot source settings are unchanged.

## Message to Claude

```text
Implement PRD-LIBRARY-LIVE-SEARCH.md in the CURRENT Rafeeq checkout.

Add a search field above the library sections. Search ONLY the user's actual Islamic Content Encyclopedia connector and IslamHouse directly from the backend. Display real result titles, source snippets when available, source names, types when known, and original links. Provide source filters and bounded pagination.

This is library content discovery, not chatbot answer generation. A result from one source is sufficient. Do not require multiple sources, force site ordering, generate religious answers/snippets, or label external results as reviewed library items.

Inspect the current frontend/src/app/discover/Library.tsx, queries.ts, types.ts, backend/app/knowledge/discover.py and library.py. Reuse implemented live-source adapters where available. Prove search/fetch capabilities from the actual backend environment, not merely Claude MCP access. Do not invent endpoints or assume islamhouse_enc identifies the user's intended encyclopedia.

Use a library-specific allowlist: islamic_content and islamhouse only. Reject other source IDs with 422; never inherit the chatbot allowlist or silently search extra sites. Verify the real IslamHouse search capability; renaming an existing connector or assuming islamhouse_enc covers the full live library is not sufficient. If one connector exposes both services, preserve distinct filters and provenance and deduplicate shared items.

Preserve GET /api/discover/library and its reviewed catalog. Add the separate search contract from the PRD. Handle partial source failure, query changes, timeouts, source filtering, safe result rendering, and real pagination. Keep the current catalog visible before search and after clearing it.

The screenshot's privacy statement must remain accurate. Do not persist search/open histories or log query bodies. Use POST and no-store for search, and explain briefly that search terms are sent to external sources. Do not promise that external sites cannot see searches or visits.

Follow the ordered implementation steps and B01-B22 tests. Test mocks first, then bounded live search from the backend. Provide UI verification for mobile RTL and keyboard access.

Write docs/engineering/implementation/KNW-06-library-live-search-report.md with actual connectors, changed files, test commands/results, latency, UI evidence, remaining dependencies, and rollback steps. Never claim the feature is fully integrated if a required connector is unidentified or only works inside Claude.
```

أرسل هذا الملف وملف PRD مع المشروع الحالي إلى Claude. الملفان يخصان محرك بحث المكتبة، ولا يستبدلان ملفات إصلاح الشات السابقة.

