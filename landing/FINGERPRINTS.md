# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| zahra (Rafeeq landing, 2026-10-05) | Sky and sheet (new): one fixed night world, one mist sheet lifted over it, night again at the end | Wordmark + language switch + one CTA bar that turns mist over the sheet; desktop chapter rail under the docked flower (petal bullets fill as read) | Pinned night sky, five code-generated planes (stars/pattern, halo, year flower, blurred near petals, dawn glow); one petal draws on arrival | pin > flow > pin > flow(iris reveal) > flow(parallax dial) > flow(progress row) > pin; 7 acts, 10.8vh desktop, 11.1vh phone | Sheet edge passes, night returns, flower comes home and blooms (12th petal, gold core, 3-plane confetti); amber CTA, mentor line and footer inside the held stage | The companion flower: one SVG that is the hero subject, the docked progress emblem and the closing bloom | Brand-illustrated (petal geometry, no imagery) | frontend/public/landing (served at /landing/) |


---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- Grammar "Sky and sheet" (night world / day sheet / night return).
- Signature: a single brand object that travels the page (hero subject → docked nav emblem → closing bloom).
- Close: "the world returns and the object completes" with the CTA under it.
- Act shape pin > flow > pin > flow > flow > flow > pin at ~11vh.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
