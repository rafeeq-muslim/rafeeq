# AGENTS.md — Rafeeq (رفيق)

Rafeeq accompanies a new Muslim through their first year, in their own language: a Duolingo-style learning path, an assistant that answers only from approved Islamic sources and refers to a human when needed, human mentors, and daily Muslim tools. Built for the Bathel "AI Challenge for Serving Islamic Content" (Track 3), Oct 4–6, 2026.

## Before you do anything

Read, in order:
1. `docs/00-start-here.md` — how the docs work (domains → features → behaviours).
2. `docs/agents/rules.md` — binding rules. Non-negotiable.
3. `docs/domains.md` — the six domains, owners and events.
4. Then follow `docs/agents/README.md` for the files your task needs.

The human docs are in Arabic; code, identifiers, commits and code comments are in English. Use the terms in `docs/agents/glossary.md`.

## Working rules

- **Stay inside the feature you were given.** Build only what its rules and examples describe. Anything missing goes to the feature's «أسئلة مفتوحة» and to the human, not into the code.
- **Respect domain boundaries.** A domain owns its data; other domains learn about changes through the events in `docs/domains.md`. Don't reach into another domain's data.
- **Examples are tests.** Each بافتراض / عندما / فإن example maps to at least one automated test.
- **IDs everywhere.** Put the feature ID and rule (e.g. `knw-01-r2`) in branch names, commits and PR titles.
- **Never redefine a rule from `docs/agents/rules.md`.** Propose changes to the product owner (ناصر بن عبدالعزيز العويمر).
- **Mark uncertainty** (✅ 💬 ⚠️). Never invent numbers, sources, owners or dates.

## The rules you must never break (full text: `docs/agents/rules.md`)

- No independent fatwa; no answer without an approved source; Quran and hadith text only from the database, never generated or modified.
- Danger cases go to a human immediately.
- Worship is tracked privately and never rewarded; points, badges and leaderboards count learning only.
- Minimum data; location never leaves the device; no ad trackers; neutral notifications by default.
- No images of prophets or companions; no music under recitation.
- Use each source only as its license allows (`docs/agents/sources.md`).
- The repo will be public: never commit secrets, user data, chat exports, voice notes, phone numbers or emails.

## UI and the design system

- All UI uses `frontend/` (shadcn/ui + Tailwind v4, Arabic-first RTL). Read `frontend/DESIGN.md` and the skill `skills/rafeeq-design-system/SKILL.md` before building a screen.
- Use Rafeeq components (`@/components/rafeeq`) and shadcn primitives before writing new UI; semantic tokens only; logical properties only; no letter-spacing on Arabic.
- Run `npm run check:design` and `npx tsc -b` in `frontend/` before committing UI.
- Design skills for review and handoff are in `.claude/skills/`; the Rafeeq skill's rules win over generic advice.

## Definition of done for any change

- The feature's examples pass as tests.
- No rule or domain boundary was crossed.
- The ID is in the branch, commits and PR.
- New sources, models, fonts or libraries are added to the sources/licenses log.
- If behaviour changed, the feature document was updated in the same PR.
