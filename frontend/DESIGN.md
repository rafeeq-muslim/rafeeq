---
version: alpha
name: Rafeeq
description: >-
  Design system for Rafeeq (رفيق), a companion for new Muslims in their first
  year. Arabic-first, right-to-left, also English and Tagalog. Built on
  shadcn/ui (radix-nova) and Tailwind CSS v4. Source of truth for values:
  src/styles/tokens.css (brand primitives) and src/index.css (semantic tokens).
colors:
  primary: "#5A48D6"
  on-primary: "#FFFFFF"
  secondary: "#ECE9FF"
  on-secondary: "#3B2D99"
  celebrate: "#F5A23A"
  on-celebrate: "#1D1645"
  celebrate-surface: "#FFF1DC"
  on-celebrate-surface: "#6B3A0A"
  background: "#F7F6FB"
  on-background: "#1D1645"
  surface: "#FFFFFF"
  on-surface: "#1D1645"
  muted: "#F4F2FF"
  on-muted: "#6B6890"
  text-secondary: "#46425F"
  outline: "#E4E1F2"
  ring: "#8B7CEB"
  ink: "#1D1645"
  on-ink: "#F7F6FB"
  deep: "#3B2D99"
  lavender: "#7A5CE0"
  orchid: "#C47AD0"
  apricot: "#FFC77D"
  dawn: "#F08A4B"
  glow: "#FFD38F"
  success: "#157249"
  success-surface: "#E3F4EC"
  warning: "#8A4F0A"
  warning-surface: "#FFF1DC"
  error: "#B23A43"
  error-surface: "#FBE7E8"
  info: "#5A48D6"
  info-surface: "#ECE9FF"
typography:
  display:
    fontFamily: thmanyah serif display
    fontSize: 56px
    fontWeight: 700
    lineHeight: 72px
  h1:
    fontFamily: thmanyah serif display
    fontSize: 40px
    fontWeight: 700
    lineHeight: 52px
  h2:
    fontFamily: thmanyah serif display
    fontSize: 28px
    fontWeight: 700
    lineHeight: 40px
  h3:
    fontFamily: thmanyah sans
    fontSize: 22px
    fontWeight: 700
    lineHeight: 34px
  reading:
    fontFamily: thmanyah serif text
    fontSize: 19px
    fontWeight: 400
    lineHeight: 34px
  body:
    fontFamily: thmanyah sans
    fontSize: 17px
    fontWeight: 400
    lineHeight: 30px
  label:
    fontFamily: thmanyah sans
    fontSize: 15px
    fontWeight: 500
    lineHeight: 20px
  caption:
    fontFamily: thmanyah sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
rounded:
  sm: 8px
  md: 12px
  card: 20px
  panel: 28px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 20px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 44px
  button-celebrate:
    backgroundColor: "{colors.celebrate}"
    textColor: "{colors.on-celebrate}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 52px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 48px
    padding: 16px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.card}"
    padding: 20px
  badge-celebrate:
    backgroundColor: "{colors.celebrate-surface}"
    textColor: "{colors.on-celebrate-surface}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    height: 28px
  source-strip:
    backgroundColor: "{colors.celebrate-surface}"
    textColor: "{colors.on-celebrate-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 12px
  bubble-user:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
  bubble-assistant:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
  celebration-screen:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.h1}"
  alert-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
  alert-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
  alert-error:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error}"
  alert-info:
    backgroundColor: "{colors.info-surface}"
    textColor: "{colors.info}"
---

# Rafeeq design system

## Overview

Rafeeq (رفيق, "companion") walks with a new Muslim through their first year, in their own language. The interface should feel **warm, patient, trustworthy and celebratory**: a friend who teaches, never a preacher who lectures, a mufti who rules, or a monitor who counts shortcomings.

- Arabic first and right-to-left; every screen also works in English and Tagalog (left-to-right).
- Mobile first: 375–390px is the design width, 44px is the minimum touch target.
- Calm surfaces (mist background, white cards) with one strong action colour (violet). Amber is rare, so it means "you did it".
- **Concept: «زهرة تكتمل», the year is a flower that completes petal by petal.** Every graphic is generated in code from the logo petal: the year flower (one petal coloured per month of learning, blooming once on Home), the halo framing it, the tone-on-tone petal pattern, the core glow behind numbers and badges, petal confetti, petal bullets and spot illustrations. No mascots, faces or living beings; no mosque or arch clichés.
- **Mobile-game tactility:** pressable surfaces (main buttons, the continue tile, answer tiles, path steps) carry a 4px darker "lip" and press down on tap (Duolingo's pattern, in our pill shapes and colours). Informational surfaces stay flat.
- **Night and day:** Home opens on a night-sky hero (ink to deep violet) with the year flower; content sits on a mist sheet that overlaps it with a 28px radius. Celebrations always happen at night.

## Colors

- **Rafeeq Violet (#5A48D6) → `primary`:** every action, link, active tab and the user's chat bubble.
- **Amber (#F5A23A) → `celebrate`:** celebration only (badges, milestone CTA, the source strip that closes a Sharia answer, the active-tab dot). Never a general accent and never a hover colour (`accent` in shadcn stays violet-50).
- **Ink (#1D1645):** text and the dark "reverse" surface used by the celebration screen and dark mode.
- **Mist (#F7F6FB):** app background; cards are white.
- **Companionship gradient** (#3B2D99 → #7A5CE0 → #C47AD0 → #F08A4B, 120°): hero cards only. It is mirrored to 240° in RTL so start-aligned white text always sits on the deep-violet end.
- **Functional:** success, warning, error and info, each as text colour on its own surface (all pass WCAG AA as pairs).
- **Never** put white text on amber, orchid, apricot or the amber gradient; use ink.
- Components use semantic tokens only (`bg-primary`, `text-muted-foreground`, `bg-celebrate-surface`). Brand primitives (`--rf-*`) are for tokens and logo geometry.

## Typography

- **Thmanyah** is the brand typeface: Sans for UI and text, Serif Display for headings and the wordmark, Serif Text for long reading. Its licence (font.thmanyah.com/licenses) allows bundling it inside our web and mobile apps, and forbids redistributing, hosting it as downloadable files, or modifying it. The files therefore live in the git-ignored `public/fonts/thmanyah/` (see `src/styles/fonts.css`), never in the public repo. Fallbacks: self-hosted **IBM Plex Sans Arabic** (UI) and **Noto Naskh Arabic** (headings and reading). No font CDN at runtime.
- Scale: display 56/72, h1 40/52, h2 28/40, h3 22/34, reading 19/34, body 17/30, label 15/20, caption 13/20. Arabic needs the taller line heights; do not tighten them.
- **No letter-spacing on Arabic** (it breaks cursive joins). No italics in Arabic.
- **Latin digits everywhere** (1, 2, 3), with `tabular-nums` where numbers line up.
- Mixed-direction content (an English name inside Arabic UI, a Tagalog question in the mentor inbox) is isolated with `<bdi>` or `dir="auto"`.

## Layout

- 4px grid. Common steps: 8, 12, 16, 20 (card padding), 24, 32, 48.
- Logical properties only: `ms/me`, `ps/pe`, `start/end`, `text-start`, `border-s`. Physical `ml/mr/pl/pr/left/right` are banned in components.
- Directional icons (arrows, send) mirror with `rtl:` / `ltr:` variants; non-directional icons never mirror.
- Screens: one column, 16px side gutters, bottom navigation with five tabs. The mentor tab is always present.
- **Adaptive shell (container queries on `AppShell`):** below 840px, bottom navigation and a single column. From 840px, a navigation rail on the leading edge (right in Arabic), a centred column up to 600px and a 320px supporting pane. From 1200px, the rail widens into a labelled drawer. Same features on every size; restructure, don't stretch.
- **Native feel on phones (Emil Kowalski's mobile-native):** `viewport-fit=cover` with `env(safe-area-inset-*)` on bars and sheets, `100dvh` for the shell, inputs at 16px or more (no iOS zoom), no tap highlight, `overscroll-behavior: none` on the page and `contain` on inner scrollers, `touch-action: manipulation` on controls, one `theme-color` per colour scheme.

## Elevation & Depth

- `shadow-card`: soft, ink-tinted resting cards.
- `shadow-raised`: hero cards, sheets and the device frame.
- `shadow-glow`: amber glow for celebration only.
- **Lip (`tactile` utility):** `box-shadow: 0 4px 0 var(--lip)`, collapsing to 0 with `translate: 0 4px` on press over 120ms. Lip tokens: `--primary-lip` (#3B2D99), `--celebrate-lip` (#B86E12), `--secondary-lip`, `--outline-lip`, `--success-lip`, `--danger-lip`. Path steps use a 6px lip.
- **Motion (Emil Kowalski's animate):** `--rf-ease` cubic-bezier(.23,1,.32,1) for enter/exit and press, `--rf-ease-in-out` (.77,0,.175,1) for movement, `--rf-ease-drawer` (.32,.72,0,1) for sheets. Press 120ms, UI under 300ms, sheets 320ms. Never `ease-in`, never from `scale(0)`. Frequent actions get no animation; delight is reserved for the year flower's bloom and celebrations (the badge may overshoot there only). Reduced motion lands on the final state.
- Dark mode is the ink world: surfaces are violet-ink mixes, borders are white at 10%.

## Shapes

- Buttons, chips, tabs and toggles: full pill (999).
- Inputs, selects and small tiles: 12.
- Cards and chat bubbles: 20.
- Panels, sheets and the composer: 28.
- Petals: the logo ellipse (rx 8, ry 22 on a 120 grid, tilted 18°), stroke 3.5, or 6.2 below 64px.

## Components

Primitives are shadcn/ui (radix-nova) in `src/components/ui`, re-themed to the tokens above. Rafeeq components live in `src/components/rafeeq`, one file per domain (learning, motivation, knowledge, companion, practice, platform), and compose the primitives.

- **Button:** default (violet), secondary, outline, ghost, destructive, `celebrate` (amber, ink text). Sizes xs 28, sm 36, default 44, lg 52. Loading = `Spinner` + `disabled`.
- **Badge:** default, secondary, celebrate, success, warning, info, destructive, outline. Height 28.
- **Card:** full composition (header, title, description, action, content, footer). The footer has no grey band.
- **Chat:** shadcn `MessageScroller`, `Message`, `Bubble`, `Marker`. `AssistantMessage` requires at least one source and ends with `SourceStrip`.
- **Path:** units are months (`PathUnitHeader` with the petal pattern). `PathNode` is a pebble with a lip and has four states (done, current, open after placement, locked); the current one carries the «ابدأ» bubble and the halo. Nodes zig-zag with logical offsets.
- **Exercise:** `ExerciseOption` is a real radio styled as a tactile tile; `ExerciseFeedback` is a bottom sheet in the result colour with the next action in thumb reach.
- **Shell and graphics:** `AppShell`, `TopBar`, `JourneySky` + `JourneySheet`, `YearFlower`, `PetalPattern`, `CoreGlow`, `PetalConfetti`, `PetalRow`, `SpotIllustration`, `LessonMedallion`.
- **Motivation:** points, streaks, badges and leaderboards count learning only. The streak pauses, it never resets. Worship habits are private and never rewarded.
- **Safety:** `HumanHelpButton` is visible on Ask and lesson screens. `DangerHelpPanel` replaces any AI answer in a danger case and never shows invented helpline numbers.

## Do's and Don'ts

- Do end every Sharia answer with an amber source strip; don't show an answer without a source (show `ReferralCard`).
- Do write CTAs as verbs that name the outcome («تابع إلى درس الصلاة»); don't use «موافق» or «إرسال» alone.
- Do say «متوقفة مؤقتًا» for a paused streak; don't say «خسرت سلسلتك» or show a broken-streak screen.
- Do keep amber for celebration; don't use it for hovers, links or decoration.
- Do use semantic tokens and shadcn variants; don't override component colours with `className` or add manual `dark:` colours.
- Do use logical properties and test every screen in RTL and LTR; don't use `ml-*`, `pr-*`, `left-*` or `text-left`.
- Do keep Arabic letter-spacing at 0 and line heights tall; don't apply `tracking-tight` to Arabic headings.
- Do use the official logo files and the parametric `RafeeqSymbol`; don't stretch, recolour or redraw the mark.
- Do put the lip only on things that can be pressed; don't add it to informational cards.
- Do generate graphics from the petal geometry; don't add stock illustrations, mascots, faces or mosque/arch imagery.
- Don't show images of prophets or companions, and don't put music or sound effects under recitation.
