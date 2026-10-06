# Claude Implementation Handoff

## Files and destination

- Main specification: `KNW-01-chatbot-reliability-prd.md`.
- Repository-relative destination: `docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md`.
- Identify the repository root by locating both `frontend/package.json` and `backend/pyproject.toml`. Do not create another `rafeeq-main` directory inside the repository.
- If the repository folder is named `rafeeq-main`, the full project-relative example is `rafeeq-main/docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md`.
- Optional destination for this handoff: `docs/engineering/implementation/KNW-01-chatbot-reliability-handoff.md`.
- Preserve the existing `KNW-01-sourced-answer.md`. Add a relative link to the new PRD rather than replacing the original feature specification.

## Ready-to-use message for Claude

```text
I am providing the Rafeeq repository and KNW-01-chatbot-reliability-prd.md.

First locate the actual repository root and place the PRD at:
docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md

Read the complete PRD, including section 14, before implementation. Then implement the chatbot reliability fix described in it. The two reported failures are inconsistent results when asking the same or equivalent question, and suggestion clicks failing while typing the question succeeds.

Inspect the current checkout before changing code. References and line numbers in the PRD come from the supplied archive and may differ. Establish a reproducible failing test and trace the failing stage. Do not assume a stale React state bug: the inspected code already calls send(s) explicitly for suggestions. Do not claim that a specific production root cause is proven without evidence.

Follow the ordered implementation plan. Correct failure classification, submission equivalence, deadlines, query normalization/cache consistency, and bounded recovery. Preserve source verification and safety routing. Do not solve this by suppressing the verifier, lowering retrieval thresholds without evaluation, hardcoding a generated religious answer, or retrying until a verifier happens to pass.

Run the relevant frontend/backend tests and the acceptance matrix. Use existing project dependency and database setup instructions. Never run database migrations against production as a test. If a service, approved content, credentials, or test budget is missing, finish the independent implementation and report exactly which verification remains blocked. Never invent a successful test result or content approval.

Update documentation links and write an implementation report at:
docs/engineering/implementation/KNW-01-chatbot-reliability-report.md

The report must include confirmed causes, changed files, exact commands and results, acceptance-case status, before/after measurements, remaining limitations, and rollout/rollback steps. Distinguish implemented, tested locally, and verified live. Do not mark the whole issue resolved until the required acceptance gates pass.
```

## توضيح للمستخدم

أرسل إلى Claude ملف الـPRD مع المشروع، ويمكنك إرفاق هذا الملف أو نسخ الرسالة الإنجليزية أعلاه. اسم ملف الـPRD والمسار بالإنجليزية، ومحتواه بالعربية مع تفاصيل تقنية. يحدد القسم 14 قرارات التنفيذ وحالات الفشل التي يجب التعامل معها، بالإضافة إلى خطة الاختبار الموجودة في الوثيقة.

تسليم هذه الملفات يوضح المطلوب تنفيذه؛ التأكد من زوال العطل فعليًا يكون بعد تنفيذ الإصلاح واختبار النسخة المشغلة.
