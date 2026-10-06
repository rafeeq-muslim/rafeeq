# Claude Source Coverage Handoff

## Destination

Place `KNW-02-source-coverage-and-retrieval-prd.md` at:

```text
<repository-root>/docs/domains/knowledge/features/KNW-02-source-coverage-and-retrieval-prd.md
```

Find the root containing `frontend/package.json` and `backend/pyproject.toml`. Do not create a nested copy of the project. Preserve the earlier KNW-01 reliability PRD and implement shared changes consistently.

## Message to Claude

```text
Investigate and implement KNW-02-source-coverage-and-retrieval-prd.md in the Rafeeq repository.

The user expects both Ibn Baz and IslamQA to be available. In the inspected archive, islamqa is registered in load.py but absent from the default KNW_ANSWER_SOURCES in config.py. Both retrieval channels and the scheduled embedding job use that source list. This is a confirmed default exclusion, not proof of the current production environment value.

First inspect the actual runtime source list without printing secrets. Check source/language passage counts, embedding coverage, and candidate-to-citation traces. Locate the user's MCP configuration if present in the supplied environment; do not assume a developer MCP connection is called by the chatbot. The inspected answer path searches the local database.

Unify source eligibility, correct effective configuration, validate/import missing data safely, and prepare missing embeddings within the existing budget. Test retrieval before changing ranking. Do not force equal citations, fabricate source cards, replace other approved sources, bypass verification, or add live MCP calls to every question as a shortcut.

Follow S01–S20 and the linked KNW-01 acceptance criteria. Keep historical source-policy metadata accurate; do not invent approvals or silently erase it. Missing infrastructure or reviewed content must be reported accurately, while independent implementation continues.

Write the implementation report at:
docs/engineering/implementation/KNW-02-source-coverage-report.md

Include verified causes, effective configuration before/after, per-source readiness and retrieval measurements, test commands/results, MCP integration findings, remaining limitations, and rollback instructions. A change to config.py or successful MCP tools/list is not sufficient evidence that production answers now use the source correctly.
```

## للمستخدم

أرسل الملفين مع المشروع إلى Claude. هذه الوثيقة الثانية تعالج أهلية المصادر وتغطيتها، وتتكامل مع الوثيقة الأولى الخاصة بثبات الإجابات. اسم المصدر التقني للإسلام سؤال وجواب هو `islamqa`، وليس `islamhouse_enc`.
