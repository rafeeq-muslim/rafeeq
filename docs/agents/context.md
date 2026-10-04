# Project context

Background a human team member already carries in their head. Read it before drafting features or code.

## The challenge

| Item | Value |
| --- | --- |
| Name | تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي (AI Challenge for Serving Islamic Content), by مؤسسة باذل (Bathel) ✅ |
| Site | https://islamicaich.org ✅ |
| Track | Track 3: التجارب التفاعلية والرحلة المعرفية للتعريف بالإسلام وتعلمه (interactive experiences and knowledge journeys) ✅ |
| Track success criterion | When tested with the target group, does the solution improve understanding of an Islamic concept, or the fit and sequence of content and the continuity of the user's journey, while respecting privacy and not inferring or classifying the user's religious or sensitive traits? ✅ |
| Challenge days | Oct 4–6, 2026, remote. Daily: 09:00 check-in, 10:00–19:00 mentoring (Discord), 22:00 check-out; last day submission closes 23:59 (Riyadh time) ✅ |
| After | Initial judging Oct 7–15 (top 20), finalists announced Oct 18, final judging Oct 19–22 (5 min presentation + 3 min Q&A on Zoom), ceremony Oct 26 in Riyadh ✅ |

### Required deliverables ✅

1. A fully working product, ready for real use. A prototype is explicitly not accepted.
2. A live demo link, tested end to end.
3. A **public** GitHub repository: full code we may publish, component licenses, run instructions, no user data or secrets.
4. A video of at most 2 minutes.
5. A presentation (PDF/PowerPoint): problem, solution, how it works, added value, technologies in detail, screenshots, results, continuation plan.
6. Documentation of content and Sharia/knowledge sources, and a log of sources, tools and licenses.

### Final judging criteria ✅

| Criterion | Weight | What a top score needs |
| --- | --- | --- |
| Technical quality and use of AI | 25% | Stable product; AI does real work with a documented method; results repeat consistently; measurable improvement from the chosen approach |
| Benefit per the track's success criterion | 20% | Verifiable improvement with the target group, compared against a baseline, with the measurement method shown |
| Reliability and scientific safety | 15% | Passes all critical cases; consistent over repeated runs on the full test set; exposes its limits; traceable sources; human review |
| Innovation and added value | 15% | Proven advantage over a named alternative or current practice |
| Beneficiary experience, communication, accessibility | 10% | Target users complete the task; clear, respectful language fitted to background and language; improvements made from testing |
| Operational realism | 10% | Costs, dependencies, content-review plan, alternatives for critical dependencies, adoption plan |
| Clarity and verifiability of the presentation | 5% | Claims linked to evidence; easy re-testing; clearly separates what was built from what is proposed |

Screening criteria (already passed, team accepted Sep 30): problem 25%, AI fit 15%, reliability 20%, feasibility 15%, originality 15%, execution 10%.

## The team

| Member | Platform role ✅ | Owns 💬 |
| --- | --- | --- |
| ناصر بن عبدالعزيز العويمر | Leader, AI specialist | Product owner; Platform domain; code foundation, server, AI integration |
| ناصر بن خالد العويمر | Developer | Design system and visual identity; Daily Practice domain |
| مهند بن صالح الفوزان | Sharia specialist | Learning and Motivation domains; Sharia review of all content |
| مسلّم بن عبدالعزيز العمير | UI designer | Knowledge & Ask domain (sources, assistant, Discover) |

Companion & Community has no owner yet.

External expert consulted: محمد ردمان (منتدى القرآن التقني / جمعية خدمة المحتوى الإسلامي باللغات). His advice: build a whole system, not just software (content, operations, funding, testers, adoption by dawah organizations); short "microlearning" content in the style of Deepstash; Duolingo-style engagement; start from the need, not the tools; existing new-Muslim services reach very few compared to demand.

## Product decisions so far

- Product name رفيق; mobile-first web app first, native wrapper later.
- Answers by retrieving approved content, not by generating fatwas.
- No Al-Fatiha recitation coach and no transliteration (Sharia concern, and not feasible now).
- Optional account (display name, username, password; all generatable; optional email 2FA).
- Six domains; Organizations postponed (see `../domains.md`).
- Gamification decisions in `rules.md` §3.
- Full log with reasons: `decisions.md`.

## Technical direction

| Item | Status |
| --- | --- |
| LLM provider | OpenRouter 💬, with a backup model |
| Tool layer | An MCP server exposing search over approved sources 💬 (the ICSA MCP server exists, see `sources.md`) |
| Retrieval | RAG over an index of license-permitted approved content |
| Prayer times | `adhan` on-device |
| Language, framework, database, hosting | Decided by the leader; not yet recorded ⚠️ |
| Languages in v1 | Arabic, English, Tagalog ✅ (deck) |

## Evidence

Numbers we can cite, with sources and reliability notes: `evidence.md`. Full research reports: `research/`.
