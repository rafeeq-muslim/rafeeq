# How to draft or expand a feature

Use this when a team member asks you to turn an idea into a feature, expand a feature document, or review one. The human docs are deliberately short; you carry the context.

## The method: domain first, then behaviour

1. **Place it in a domain** (`../domains.md`). The domain card's fixed rules and terms bound the design. If the idea fits no domain, or needs another domain's data, say so and name the event it would need (`glossary.md`, domain events).
2. **Check `../features.md` first.** If a feature already covers the need, expand that one; don't create a duplicate.
3. **Write the story** with a persona from `../personas.md`: «بصفتي [شخصية]، أريد…، حتى…».
4. **Example Mapping:** list the **rules** (one sentence each, a business rule, not a UI step), give each rule one or more **examples** in بافتراض / عندما / فإن form, and put everything uncertain under **open questions**. A feature with more than about 6 rules or 15 examples is two features: split it.
5. **Check it against `rules.md`.** Any conflict is flagged to the human, never silently resolved.

## Writing good examples

- **Declarative, not UI scripts.** Write «عندما يرسل سؤاله», not «عندما يضغط الزر الأزرق في أسفل الشاشة». The UI is the designer's free choice.
- **One behaviour per example.** If an example has two "فإن" outcomes that could fail separately, split it.
- **Business language from `glossary.md`.** The same term every time.
- **Concrete values when they matter:** «بافتراض أن آخر يوم تعلّم كان قبل يومين», not «بعد مدة».
- **Cover the unhappy paths:** at least one error or edge example per feature; for anything touching Sharia content, privacy or danger, cover the refusal or referral path explicitly.
- **Permissions:** for anything showing user data to another person (mentor, group, leaderboard), add an example of who must *not* see it.

## Template

`../templates/feature.md`. Keep these sections in this order: header table, القصة, لماذا, القواعد والأمثلة, خارج النطاق, أسئلة مفتوحة.

**IDs:** domain code + number (`KNW-01`). Rules are numbered inside the feature (`KNW-01 / القاعدة 2`). Use the ID in branch names, commits and PR titles (`knw-01-r2-refusal`), and always write the feature name next to the ID in prose.

## From behaviour to code (TDD)

Each example becomes at least one automated test, named in English after the rule and example, e.g. `test_knw01_r3_no_source_refuses_and_offers_human`. Write the test first where practical, then the code.

## Quality bar before marking a feature «جاهزة»

- [ ] Belongs to one domain; respects that domain's fixed rules and `rules.md`
- [ ] Story names a real persona
- [ ] Problem stated without the solution; one success measure
- [ ] Every rule has at least one example; at least one error/edge example
- [ ] Privacy/permission example wherever another person could see user data
- [ ] Refusal/referral examples wherever Sharia content or danger is involved
- [ ] Open questions listed instead of assumptions; numbers only with sources (`evidence.md`)
- [ ] Listed in `../features.md` with priority and status

If you can run code, check structure with `skills/rafeeq-prd/scripts/check_feature.py <file>`.

## What not to do

- Don't invent statistics, sources, owners or dates. Mark unknowns as open questions.
- Don't write UI layouts or code in the feature document.
- Don't redefine a rule from `rules.md` inside a feature.
- Don't expand scope beyond the story; propose new features as new rows in `../features.md`.
