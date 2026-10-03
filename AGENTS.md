# AGENTS.md — Rules for coding agents working on Rafeeq (رفيق)

Rafeeq accompanies a new Muslim through their first year, in their own language. It teaches the basics step by step, answers questions from approved Islamic sources only, and connects the user to a human when needed. It is being built for the Bathel "AI Challenge for Serving Islamic Content" (Track 3), Oct 4–6, 2026.

These rules apply to every agent (Claude Code, Codex, Cursor, etc.) and every human using one. They are short on purpose. If a rule here conflicts with a request, stop and ask the human; do not pick a side yourself.

## 1. Read before you write anything

Read these, in order, before your first change in a session:

1. `docs/prd/PRD-000-product.md` — the product PRD (root). **§6 holds the shared technical requirements**: data model, auth, Sharia/content rules, AI rules, privacy, conventions. Every feature inherits them.
2. The feature PRD you are working on, in `docs/prd/features/`.
3. The story you were asked to build, and its acceptance criteria (Given/When/Then).
4. `docs/prd/00-guide.md` — only if you are asked to write or change a PRD.

The PRDs are written in Arabic. Code, identifiers, commit messages and code comments are in English.

## 2. How to work from a PRD

- **Build only what a story asks for.** If something you need is not in the PRD, add it to the feature PRD's "Open questions" table and tell the human. Do not invent scope.
- **Every story has an ID** like `F04-S2` (feature 04, story 2). Put the ID in the branch name (`f04-s2-short-name`), every commit message, and every pull request title. Work without an ID is not reviewed.
- **Acceptance criteria are the tests.** Each Given/When/Then criterion should map to at least one automated test or a written manual check. Cover the happy path, the error path, and the permission path.
- **Never redefine a shared rule inside a feature.** Data model, auth, error format, Sharia rules and privacy rules live once, in PRD-000 §6. If a feature needs a change there, propose it to the product owner; do not fork it.
- **One-way-door decisions** (data model, public API shape, vendor lock-in, handling of personal data) go into the decision log of the relevant PRD, with the reason and the rejected alternatives, before you implement them.
- **Mark uncertainty in docs:** ✅ from a source document · 💬 said by the team · ⚠️ inferred, needs checking. Never present an assumption as a fact, and never invent statistics or sources.

## 3. Sharia and content rules (non-negotiable)

These come from the challenge's "Reference & Scientific Package" (المرجعية والحزمة العلمية). Full table in PRD-000 §6.4.

- **No independent fatwa.** The system never issues a ruling on a personal case (content level D). It gives general information and refers the user to a qualified person.
- **No source, no answer.** If retrieval returns no adequate approved source, the assistant says so and offers a human. It never answers from the model's general knowledge.
- **Scripture comes from the database, never from the model.** Quran verses and hadith text are displayed from stored records by ID. If a model output cites a reference that does not exist in the retrieved set, drop the answer.
- **Separate scripture from explanation.** Quran/hadith text, scholar's words, and generated explanation must be visually distinct.
- **Disputed matters (level C):** state that scholars hold several views; never auto-prefer one.
- **Danger cases** (harm, eviction, self-harm): connect to a human immediately. The AI does nothing else.
- **Disclose the AI.** The assistant always identifies itself as an AI tool, not a person.
- **Never gamify worship.** No points, streaks or levels for prayer, fasting or any act of worship. No "religiosity" scores. Motivation counts learning only.
- **No religious inferences about the user.** Do not classify or infer the user's religious state, sincerity or sensitive traits.

## 4. Privacy and repository hygiene

The repository will be **public** (a challenge requirement). Treat every commit as published.

- Never commit secrets, API keys, `.env` files, user data, chat exports, voice notes, phone numbers or emails. Use environment variables.
- Collect the minimum data. The account is optional; see PRD-000 §6.3 for exactly what is stored.
- Passwords are hashed (Argon2id or bcrypt). Never log passwords, codes or full question text tied to an identity unless the PRD says so.
- Send the LLM provider only the text it needs (the question and retrieved passages), never identity data.
- Respect source licenses. Record every external source, dataset, model and library with its license in the sources/licenses log required by the challenge.

## 5. Definition of done for any change

- The story's acceptance criteria pass (automated where possible).
- No shared rule was redefined; any needed change was proposed in PRD-000.
- The story ID is in the branch, commits and PR.
- New sources, tools or libraries are added to the sources/licenses log.
- If behavior changed, the feature PRD was updated in the same PR.
