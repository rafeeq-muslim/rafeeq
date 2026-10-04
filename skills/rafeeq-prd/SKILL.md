---
name: rafeeq-prd
description: Plan and write product features for Rafeeq (رفيق), the hackathon app that accompanies new Muslims through their first year, using the team's domain-and-behaviour system (six domains, a prioritized feature list, and short feature documents made of a story, business rules, and Given/When/Then examples written in Arabic as بافتراض / عندما / فإن). Use this skill whenever a Rafeeq team member wants to turn an idea into a feature, expand or review a feature document, write rules or examples (acceptance criteria), decide which domain something belongs to, add to the feature list, or check work against the project's Sharia, privacy and gamification rules, or mentions رفيق, ميزة, مجال, قاعدة, مثال, بافتراض, LRN, MOT, KNW, CMP, PRC, PLT, features.md, personas, even if they never say "PRD" or "feature".
---

# Rafeeq feature planning

Rafeeq (رفيق) accompanies a new Muslim through their first year, in their own language: a Duolingo-style learning path, an assistant that answers only from approved Islamic sources and refers to a human when needed, mentors and small groups, daily Muslim tools, and discovery content. Built for the Bathel "AI Challenge for Serving Islamic Content" (Track 3, Oct 4–6, 2026). Repo: `rafeeq-muslim/rafeeq`.

The team plans in three layers: **domains** set light boundaries, **features** list what each domain gives the user in priority order, and **behaviours** (rules with Given/When/Then examples) define each feature precisely and become its tests. Human documents are Arabic and short; all background lives in an agent context pack, bundled here.

## Bundled files

`references/` mirrors the repo's `docs/` folder as of the date in `references/agents/context.md`. The repo is the source of truth: if the user pastes a newer `features.md` or domain card, follow theirs.

| File | Read it when |
| --- | --- |
| `references/00-start-here.md` | Always, first: how the system works |
| `references/agents/rules.md` | Always: binding Sharia, AI, motivation, privacy rules |
| `references/domains.md` and `references/domains/<domain>/README.md` | Always: pick the domain, respect its fixed rules and terms |
| `references/features.md` | Before adding anything: avoid duplicates, find the next ID |
| `references/personas.md` | Writing a story |
| `references/agents/writing-features.md` | Writing, expanding or reviewing a feature: method, example style, quality bar |
| `references/templates/feature.md` | The exact skeleton of a feature document |
| `references/domains/*/features/*.md` | The three worked examples: KNW-01 (AI and Sharia), MOT-02 (motivation), PLT-02 (privacy and account) |
| `references/agents/glossary.md` | Choosing words and code identifiers; domain events |
| `references/agents/sources.md`, `evidence.md`, `context.md`, `decisions.md` | Licenses of sources, citable numbers, challenge/judging context, why past decisions were made |

## First, work out what the user needs

1. **An idea** → find its domain; check `features.md` for an existing feature covering the need (expand it rather than duplicate). Otherwise propose one new row for `features.md`: next ID in that domain, a name saying what it gives the user, one-sentence description, priority. Write a full feature document only if the user asks or the feature is chosen for building.
2. **A feature document** → follow `references/agents/writing-features.md` with the template and the closest example.
3. **Rules or examples only** → write them in the template's format for the named feature.
4. **A review** → run `scripts/check_feature.py`, then the quality checklist in `writing-features.md`; reply with a verdict (جاهزة / تحتاج تعديلًا) and the exact fixes.
5. **"Which domain?" or "is this one feature or two?"** → answer from the domain cards' "owns / doesn't own" and the split rule (more than about 6 rules or 15 examples means two features).
6. **A change to a binding rule or another domain's data** → don't do it inside the feature. Draft a proposal to the product owner (ناصر بن عبدالعزيز العويمر) or the other domain's owner, naming the event needed.

## Rules you never trade away

Rafeeq serves people at a fragile moment in their faith, and the judges weigh reliability and scientific safety heavily. Full text and reasons in `references/agents/rules.md`. If a request conflicts, keep the rule, say so, and offer a compliant alternative.

- No independent fatwa; no answer without an approved source; Quran and hadith text only from the database, never generated or altered.
- Danger cases go straight to a human; urgent requests carry no question text without consent.
- Worship is tracked privately and never rewarded. XP, badges and the opt-in leaderboard count learning only.
- Streaks pause and never reset; no hearts, leagues, shop or guilt messages.
- Minimum data; location never leaves the device; display name is the only public field; no ad trackers.
- No images of prophets or companions; no music under recitation; no transliteration of Al-Fatiha.
- Use each source only as its license allows (`references/agents/sources.md`).

## Writing quality

- Plain, professional Arabic for the team; English only for code identifiers. Name every feature by what it gives the user, and always write the name next to its ID.
- Examples are declarative business behaviour, not UI clicks; one behaviour per example; at least one error example; a permission example wherever another person could see user data; refusal/referral examples wherever Sharia content or danger is involved.
- Mark claims ✅ / 💬 / ⚠️. Never invent numbers, sources, owners or dates: use `evidence.md` or put it under «أسئلة مفتوحة». The team uploads these documents to the judges.
- Ask the user at most 2–3 short questions, and only when the answer changes the document.

## Output

- **Feature document:** one Markdown file following `references/templates/feature.md`, named `XXX-NN-short-english-name.md`, for `docs/domains/<domain>/features/`. Then give the row to add or update in `docs/features.md`.
- **New idea:** the `features.md` row, plus the domain and why.
- If you can create files, save them; otherwise give one Markdown block per file.

### Checking a feature document

```bash
python scripts/check_feature.py path/to/XXX-NN-name.md references/personas.md
```

It checks the ID, header, sections, story format and persona, rules and examples (بافتراض / عندما / فإن), presence of an error example, and size. It checks structure, not judgment: still apply the quality checklist.
