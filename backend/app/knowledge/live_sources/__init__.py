"""Live source access (PRD-LIVE-SOURCE-PRIORITY-AND-FALLBACK, version 3).

The answer path may read approved sources live, at question time, from the
backend: islamqa.info, binbaz.org.sa and the Islamic Content Encyclopedia
(islamenc.com). Any one source with suitable evidence is enough; there is no
minimum number of sources, no mandatory source and no primary/fallback order.

Modules:
- types: the shared SourceResult / Candidate / Evidence contracts;
- http: the only network door (SSRF-safe GET, per-request transport budget);
- registry: the real connectors, their hosts, languages and status;
- islamqa, binbaz, islamic_content: one adapter per connector;
- evidence: cleaning, chunk selection, de-duplication and source-neutral ranking;
- orchestrator: parallel search + fetch inside one bounded window.

Off unless `ASK_SOURCE_POLICY=live-enabled-sources-any-sufficient-v3` and the
connector is listed in `ASK_LIVE_SOURCES`."""
