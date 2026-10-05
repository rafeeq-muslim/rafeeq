# BRIEF: Rafeeq landing ("zahra")

**Self-authored under explicit creative delegation.** The product owner delegated
creative direction ("decide as an expert", "most beautiful and usable UI/UX with
the Rafeeq identity and fonts everywhere", "not repetitive AI work, غير اعتيادي").
No interview was held; every answer below is an authored decision, grounded in
the repo's own documents (evidence) and marked where it is an assumption.

Evidence read: `frontend/DESIGN.md`, `skills/rafeeq-design-system/SKILL.md`,
`frontend/src/styles/tokens.css`, `frontend/src/index.css`,
`frontend/src/components/rafeeq/{brand,graphics,hero,celebration}.tsx`,
`frontend/src/app/i18n/{ar,en,tl}.ts`, `docs/product.md`, `docs/features.md`,
`docs/engineering/ux-journey.md`, `docs/agents/rules.md`, `docs/agents/sources.md`.

Final source of the page: `frontend/public/landing/` (served at
https://rafeeq.nan.sa/landing/). This folder holds the brief and the evidence.

---

## The eight topics

1. **Vibe in three to five words.** Night, patient, warm, companioned, complete.
   References (not websites): the brand's own concept «زهرة تكتمل» (a flower that
   completes petal by petal, one per month of learning); the feeling of the night
   before Eid when the sky is clear; a hand-bound almanac where each month is one
   page. *Authored.*

2. **The journey in the reader's words.** First: "someone sees me, I'm not alone."
   Then: "I can start, it's short, it's in my language, and it's checked." Then:
   "my questions get real answers, or a real person." Then: "a person is there
   when I need one." Then: "my prayer and my location stay mine." Then: "if I
   slip, nobody blames me." Last: "the year can actually complete, and it starts
   today." *Authored from ux-journey.md personas (Joseph, Daniel, Layla).*

3. **Energy curve.** Calm night open, a brighter, busier day in the middle (the
   work: learning, asking, people, tools), a quiet dip before the end, then the
   one loud moment: the night returns and the flower blooms. Then stillness.

4. **Feeling stage by stage, and the one moment.** See the feeling curve below.
   The moment: the flower that has followed the reader down the page returns to
   the night sky and finishes blooming, and its core lights up gold.

5. **One thing no site they have seen does.** The brand mark is not a logo on the
   page, it is the reader's companion through it: one flower leaves the hero,
   rides beside the reader drawing one petal per stretch of the story, and comes
   home to bloom. (Seed of the signature move.)

6. **How far from premium-minimal.** Not minimal. A warm, illustrated, quietly
   celebratory register: the brand is genuinely illustrated (every graphic is
   generated from the logo petal), so the page is too. Two grounds (night and
   mist day), never cream-and-brass, never violet-to-blue AI gradient (the brand's
   own ink→deep violet night is the only gradient family, plus its documented
   dawn glow).

7. **One unbroken world or distinct scenes?** Neither pure form: one persistent
   night world, with one day sheet lifted over it. The sheet carries the scenes;
   the sky is the place the page begins and ends. (New grammar, see below.)

8. **Assets already owned.** Official logo files (`frontend/src/assets/brand`,
   `frontend/public/brand`), Thmanyah fonts (served from `/fonts/thmanyah/`), the
   petal geometry (PETAL: ellipse cx 60, cy 32, rx 8, ry 22 on a 120 grid, tilted
   18°, 12 × 30°). **No photography, no generation:** the brand forbids people,
   faces, mascots, mosque/arch clichés and stock imagery, and the rules forbid
   images of prophets and companions. No kie.ai key exists and none is needed.
   Every graphic on the page is code: SVG and CSS planes.

---

## Step 1: what, belief, action

- **What and for whom.** Rafeeq is a free companion app (PWA) for a new Muslim's
  first year, in Arabic, English and Tagalog. Readers: a new Muslim (first),
  a volunteer mentor, a da'wa organisation, a challenge judge.
- **Belief to install.** "I will not be alone in this year, and what I'm told
  will be trustworthy."
- **The one action.** «ابدأ رحلتك» / "Start your journey" / "Simulan ang iyong
  paglalakbay" → `/welcome`. One label, used in the bar, the hero and the close.
  Secondary, quiet: mentors join with an invite code → `/me/account`.

## Journey (beats)

```
1  Recognition   "you are not alone": the night sky and an empty flower, one petal drawing
2  Capability    short lessons from the book, in your language, approved before shown
3  Trust         no source, no answer; a person when the AI must not answer
4  Company       «أريد إنسانًا», mentors, small groups
5  Safety        prayer times and qibla computed on the phone; worship private
6  Mercy         the streak pauses, never resets; no account needed
7  Completion    the night returns, the flower completes, start today
```

## Facts the page may state (all true in the product)

Sourced answers with a source strip; "no source, no answer"; AI disclosed;
referral to a human; danger → a human immediately; guest-first (no account to
start, progress on the device, optional account with a chosen name, no email
required); three languages; every lesson approved by the Sharia reviewer before
it is shown; lessons from «المختصر المفيد للمسلم الجديد» (New Muslim Guideline);
day-one topics: shahada, wudu, first prayer; mistakes safe, no hearts or lives,
resume where you stopped; mentors see only what you allow; groups by code,
display name only, collective progress never naming who did not finish; prayer
times and qibla computed on the device, location never leaves it; adhkar;
worship private and never rewarded; streak pauses, never resets; reminders off
until asked for, at most once a day, neutral text; no ads, no trackers; built for
Bathel's AI Challenge for Serving Islamic Content (Track 3).
**No numbers, no statistics, no counters, no endorsements.**

---

## Grammar: "Sky and sheet" (new)

The structure is the app's own Home screen made into a page: a night sky
(`JourneySky`) with a mist sheet (`JourneySheet`, radius 28) lifted over it.

- **What a section is.** A stretch of the day, printed on the sheet. The sky is
  not a section: it is one fixed world, visible only above and below the sheet.
- **Sequence.** Night (welcome) → the sheet rises like daybreak and carries every
  working chapter → the sheet's lower edge passes and the same night returns for
  the ending. Exactly two ground changes, both physical edges of one object.
- **Navigation.** The year flower is the navigation: it docks beside the reader
  (desktop: the inline-end margin with the chapter list under it; phone: the bar)
  and fills as the story is read. Chapters are links; no numbers.
- **Ending.** Arrival back in the sky; the flower returns to the centre, completes
  and lights; the CTA sits under it. The ending holds.
- **Forbids.** `drift` (grounds are physical layers, never interpolated); any
  photograph or video; a third ground; cards as page structure; pan rails (the
  sheet is read, not browsed); section numbers or text counters; a scroll cue;
  amber anywhere before the peak except the flower's own core and the brand's
  source strip surface; the hero flower and the closing flower being different
  objects.

Why the eight defined grammars lost:
- *Filmic one-shot:* needs scrubbed footage and hides seams; Rafeeq's concept is
  built on two honest grounds (night and day), and it has no footage.
- *Chaptered editorial:* bans the full-bleed world and wants a paper title page;
  the brand's welcome is a night sky, and folios would read as a manual.
- *Live surface:* the honest pitch is companionship over a year, not "watch the
  tool run"; a faked app surface would breach the no-fake-screens rule.
- *Continuous world:* requires worldflight footage; and the working chapters need
  a readable day surface, which that grammar forbids.
- *Typographic poster:* bans the world and the subject; the flower is the brand.
- *Gallery / catalog:* features are not a range of objects to browse; museum
  labels are the wrong voice for a newly Muslim reader.
- *Split stage:* a two-sided "alone vs accompanied" argument would blame and
  dramatise loneliness; the brand is mercy, not contrast.
- *Rhythmic cutlist:* energy and speed are the opposite of patient.

## Signature move: the companion flower

One SVG flower, not three. It is the hero's subject (one petal draws on arrival),
it leaves the hero as the sheet rises and docks beside the reader, it draws one
more petal for every stretch of the story read (the year, month by month), its
docked emblem heads the chapter rail (whose petal bullets fill as each chapter is
read), and when the sheet ends it flies back to the
centre of the night sky, draws the twelfth petal, and its core ignites gold while
petal confetti rises through three depth planes. Coded in page JS from scroll
position; the engine is untouched.

## Tell-someone sentence

> It's the site where a little flower walks down the page next to you, gets a
> petal for every part you read, and when you reach the end it goes back into
> the night sky and blooms, with a gold light in the middle.

## Feeling curve (written before the score)

```
1  Relief        night sky, an empty flower, one petal drawing itself: "you are not alone"
2  Ease          daybreak: the mist sheet rises, a short path of three first lessons
3  Trust         the question routes: four kinds of question, four honest outcomes
4  Warmth        «أريد إنسانًا» set large, a circle of small flowers opening
5  Safety        a quiet dial: prayer worked out on the phone, location never leaves
6  Hush          a row of days where one simply pauses and the row carries on
7  Joy (peak)    the sheet ends, night returns, the flower comes home and blooms gold
```

Adjacent feelings all differ. Act 6 is the deliberate quiet before the peak.

## The peak

> "The page went dark again, and the little flower that had been following me
> came back to the middle and finished blooming, all twelve petals, with a gold
> light in its centre."

Lives in act 7. It gets the largest span on the page, the only amber fill
(CTA, core glow, confetti), and the authored silence before it.

## Authored silence

- Act 7, first ~20% of its pinned travel: bare night sky with stars while the
  flower flies home. Intentional; not dead scroll.
- The hero's last ~15%: the sheet edge rising over an unchanged sky (daybreak).

## Score

| # | Beat | Device | Why this one |
|---|---|---|---|
| 1 | Recognition | `pin` + layered `parallax` planes (bespoke) + `kinetic` h1 (greet) | Depth from five independent planes; the headline is already there on landing |
| 2 | Capability | `flow` + `in`, path drawn with `reveal` | A document moment: the only act that reads like plain paragraphs |
| 3 | Trust | `pin` (cue crossfade through four routes) + buttons that jump | An argument held still while four outcomes cross over; the reader can choose a case |
| 4 | Company | `reveal` (iris, once) | A circle opening is a change of state: alone → with others |
| 5 | Safety | `parallax` inside a framed dial + pointer tilt | Depth in a small object; slow, steady, private |
| 6 | Mercy | `flow` with `--sc-p`-driven petal row | Progress drawn by the hand, pausing without resetting |
| 7 | Completion | `pin` (largest span) + bespoke bloom + `kinetic` close | The page stops and the brand's celebration happens |

Families: pin, parallax, kinetic, flow/in, reveal, pointer, bespoke `--sc-p`.
No family twice in a row. Zero `scrub` acts (no footage). Length target: well
under the 13.6 to 13.8vh band.

## World

The brand's illustrated world, built in code: far plane (stars and the
tone-on-tone petal pattern), mid plane (the halo, the brand's enlarged thin-stroke
symbol), subject (the year flower), near plane (large blurred petals that pass in
front of the flower), atmosphere (a dawn glow that brightens as the sheet rises).
Day surfaces are mist (#F7F6FB) with ink type; night is ink→deep violet.
Type: Thmanyah Serif Display (headings), Thmanyah Sans (UI and body), Thmanyah
Serif Text (one reading line). No letter-spacing on Arabic, Latin digits.

## Language

Arabic first (RTL); English and Tagalog (LTR) via a switch. Copy is reused from
the app's own strings where it exists. Tagalog needs native review.

---

## Verification (Step 5), evidence in `../../lab/`

Served with `serve.mjs --root frontend/public`, page at `/landing/?lang=ar`.
Harness: `lab/desktop` (1440×900), `lab/mobile` (390×844), `lab/reduced`
(reduced motion). Each holds the frames, `report.json` and `sheet.png` (tiled by
`lab/sheet.py`, because shoot.mjs needs a full ffmpeg to tile and none is
installed). Final runs: no dead scroll, every cue clears 4.5:1 at its worst
frame, zero console errors, zero failed requests, on all three.
Length: 10.8vh desktop, 11.1vh phone, 7.1vh reduced (pins collapse to flow).

Manual passes: 360×640 compact phone, 1024×768 tablet (Tagalog), English and
Tagalog copy, keyboard tab order (every control lands visible at opacity 1),
static contrast pairs (lowest: muted #6B6890 on mist 4.87:1).

### Findings and fixes (earlier runs superseded)

1. Hero halo strokes scaled with its CSS transform and the halo dominated the
   hero ("busy", not "relief"). The halo is now sized in px with non-scaling
   hairline strokes at 1.75× the flower.
2. Phone: a near-plane petal sat over the hero CTA; bloom confetti sat over the
   headline. Phone-specific near positions; confetti inside the copy column is
   kept above it.
3. Phone Ask stage overflowed 844px and crossfading cases doubled text. Compact
   phone layout, abutting cue windows; under 760px tall the four routes list
   in flow instead of pinning.
4. The last Ask route faded out, leaving an empty card sliding away. It now
   holds to p = 1 (it lives inside the card, so it leaves with it).
5. Reduced motion: the static halo overflowed the hero in RTL. Sections clip.
6. 360×640 bloom overflowed its stage; tablet Tagalog hero ran to 4 lines.
   Short-screen and tablet type steps.
7. Keyboard: Ask buttons were focused off screen behind the pinned stage. A
   focused case button now parks the act on its own route.

### Feel check (cold, from the sheets, before re-reading this brief)

| Act | Intended | Felt (first pass) | Felt (final) |
|---|---|---|---|
| 1 Welcome | Relief | Busy (the halo) | Calm, held |
| 2 Learn | Ease | Clear | Clear, easy |
| 3 Ask | Trust | Deliberate, some flicker | Deliberate, trustworthy |
| 4 People | Warmth | Warm | Warm |
| 5 Daily | Safety | Quiet | Quiet, private |
| 6 Mercy | Hush | Quiet | Gentle |
| 7 Bloom | Joy (peak) | Joy | Joy, resolved |

Acts 5 and 6 read close ("quiet" twice). They are kept because they carry
different facts and look different (a dial vs a row that pauses); act 6 is the
authored hush before the peak. The peak is the largest visual change on the
sheets and the largest span (3.1).

### Not verified

- A real phone (iOS Safari or Android Chrome): touch scroll feel, `svh` under
  real browser chrome, GPU cost of the blurred fixed planes.
- The live deployment at https://rafeeq.nan.sa/landing/ (checked locally only;
  the nginx `location /` and the service-worker denylist both serve it).
- Screen readers (landmarks, headings and labels are in place but untested).
- Tagalog copy needs a fluent speaker's review.
