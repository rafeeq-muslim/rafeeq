---
name: rafeeq-design-system
description: Build, review or extend Rafeeq (رفيق) UI with its design system — shadcn/ui (radix-nova) + Tailwind v4, Arabic-first RTL, brand tokens, and the Rafeeq domain components (learning path, streak, source strip, referral, celebration, bottom nav, prayer times…). Use for ANY Rafeeq screen, component, style, copy or design review, even if the user only says "make the home screen", "add a button", "fix the layout in Arabic", "review this screen" or "write the error message".
---

# Rafeeq design system

Rafeeq's UI lives in `frontend/` in the repo. Read these before writing UI:

1. `frontend/DESIGN.md`: tokens and the rules (the contract).
2. `docs/design-system.md`: the Arabic reference: component catalogue, which component to use when, and examples.
3. `docs/agents/rules.md`: product rules that the UI must enforce (sources, safety, privacy, motivation).

Run the gallery with `cd frontend && npm install && npm run dev`. It shows every token, primitive, Rafeeq component and composed screen, with code to copy. `?tab=screens&dir=ltr&theme=dark` deep-links a view.

## The visual direction (don't fall back to plain shadcn)

- **Concept «زهرة تكتمل»:** the year is a flower completing petal by petal. Use the brand graphics from `@/components/rafeeq` (`YearFlower`, `Halo`, `PetalPattern`, `CoreGlow`, `PetalConfetti`, `PetalRow`, `SpotIllustration`, `LessonMedallion`). Never add stock illustrations, mascots, faces or mosque/arch imagery.
- **Night and day:** Home = `JourneySky` (night) + `JourneySheet` (mist sheet, radius 28). Celebrations are always on ink.
- **Tactile = pressable only:** buttons, the continue tile, answer tiles and path steps use the `tactile` utility with a `--lip` token (`--primary-lip`, `--celebrate-lip`, `--outline-lip`…). Informational blocks are flat: no shadow, no lip.
- **Fewer boxes:** whitespace and section rhythm instead of stacks of identical cards; one primary action per screen, low in thumb reach.
- **Shell:** build screens inside `AppShell` (bottom nav < 840px; rail on the leading edge + column ≤ 600px + `aside` pane ≥ 840px; labelled rail ≥ 1200px). It uses container queries (`@min-[52.5rem]/shell:`), so use those, not viewport breakpoints, inside it. Only data dashboards for a role are wide (column ≤ 960px): add the route to `WIDE` in `AppLayout` (PLT-17 R3); learner screens never are.
- **Native feel (`.claude/skills/mobile-native`):** safe-area padding on bars and sheets, `dvh` for full-height, inputs ≥ 16px, `overscroll-contain` on inner scrollers, hover only via Tailwind `hover:` (already gated).
- **Bars are opaque:** sticky top bars and bottom action bars use `bg-card` (over the backdrop) or `bg-background` (full-screen flows) with a hairline border; never `bg-*/NN` with `backdrop-blur`. A `fixed` bottom bar reserves its height with `useFooterSpace`. A conversation composer goes in `ComposerBar` (band on wide screens, input in the page's column).
- **Page header = full-width band:** use `<TopBar className="sticky top-0" />` as the first element of a page; it bleeds edge to edge on wide screens by itself. Full-screen routes (listed in `AppLayout` `FULLSCREEN`) get no gutters; paint their root with `min-h-dvh` and a background.
- **Motion (`.claude/skills/animate`):** `ease-rafeeq` (ease-out) for press/enter, `ease-drawer` for sheets; press 120ms, UI < 300ms; never `ease-in` or `scale(0)`; frequent actions don't animate; delight only for the year-flower bloom and celebrations (`badge-pop`, `petal-pop`). Reduced motion shows the final state.

## How to build a screen

1. **Use what exists, in this order:** a Rafeeq component (`@/components/rafeeq`), then a shadcn primitive (`@/components/ui`), then a new component. Check `docs/design-system.md` → «أيّ مكوّن أستعمل؟».
2. **Compose, don't restyle.** `className` is for layout (gap, width, margin). Colours and type come from variants and tokens: `variant="celebrate"`, `bg-primary`, `text-muted-foreground`, `text-body`.
3. **Write the copy with the patterns in `docs/design-system/copy.md`.** CTA = verb + outcome. Error = what happened + why + what to do. Empty = what this is + why empty + how to start.
4. **Check both directions and both themes** in the gallery, then run `npm run check:design` and `npx tsc -b`.

## Rules that are easy to break

**Direction (RTL first)**
- Logical properties only: `ms-* me-* ps-* pe-* start-* end-* text-start border-s`. Never `ml mr pl pr left right text-left text-right`.
- Arrows and send icons mirror: `className="ltr:rotate-180"` for an arrow written for RTL, or `rtl:-scale-x-100` for icons drawn for LTR. Other icons never mirror.
- Isolate mixed-direction user content: `<bdi>{name}</bdi>`, `dir="auto"` on free text, `dir="ltr"` on usernames, codes and OTP inputs.
- Progress fills from the start edge in both directions (our `Progress` uses width, not translate).

**Arabic typography**
- No `tracking-*` on Arabic. No italics. Keep the scale's tall line heights (`text-body` = 17/30).
- Latin digits always; add `tabular-nums` where numbers align.
- Headings use `font-heading` (Thmanyah Serif Display); long reading uses `font-reading`.
- Thmanyah files are bundled from the git-ignored `frontend/public/fonts/thmanyah/`; never commit them (licence forbids redistribution).

**Brand**
- Violet = action. Amber (`celebrate`) = celebration and the source strip only, never hover or decoration.
- No white text on amber, orchid, apricot or `bg-grad-amber`; use ink (`text-celebrate-foreground`).
- `bg-grad-main` mirrors itself in RTL; put white text only on hero cards that use it.
- Radii: buttons/chips pill, inputs 12 (`rounded-md`), cards 20 (`rounded-card`), sheets 28 (`rounded-panel`).
- Touch targets ≥ 44px (`Button` default is h-11).

**Product rules the UI enforces**
- A Sharia answer renders with `AssistantMessage` and at least one source; it ends with `SourceStrip`. No source → `ReferralCard`, not an answer.
- `HumanHelpButton` («أريد إنسانًا») is always visible on Ask; the lesson and review help button («مساعدة», `LessonHelpButton`) opens Ask with the lesson topic only (CMP-01 R1), and a `ReferralCard` with `question` asks «تحتاج إنسانًا؟». Danger → `DangerHelpPanel` only, no AI text, no invented phone numbers.
- No points and no leaderboard at all (rules.md §3); streaks and badges count learning only. `HabitItem worship` shows «خاص بك» and never a count of worship.
- A broken streak is «متوقفة مؤقتًا», never a loss screen.
- Display name only in groups; no images of prophets or companions; no music under recitation.
- Appearance (PLT-04, «المظهر» in `docs/design-system.md`): follows the device by default («حسب الجهاز», `theme: "system"`); light or dark only by the learner's choice (`useDevice.theme`, `ThemeSwitcher`). Only `lib/theme.ts` and `public/theme.js` read `prefers-color-scheme`. Night moments (Welcome, the Home sky, placement, celebrations) carry their own `dark` class.
- Text 4.5:1 on its real background in both themes (large text and icons 3:1); add a row to `src/styles/contrast.test.ts` for any new token or gradient under text. Primary/secondary/celebrate fills are gradients (`bg-primary bg-grad-action`); a row or tool that opens something gets `IconTile`; screens inside `AppShell` sit on `Backdrop`.

## shadcn conventions (from the official shadcn skill in `.claude/skills/shadcn`)

- Forms: `FieldGroup` + `Field` + `FieldLabel`; errors with `data-invalid` on `Field` and `aria-invalid` on the control.
- Icons inside components: `data-icon="inline-start|inline-end"`, no size classes. Tabler icons, `stroke={1.75}`.
- `gap-*` not `space-*`; `size-*` when width = height; `cn()` for conditional classes; no manual `dark:` colours.
- Dialog, Sheet and Drawer always have a title (use `sr-only` if hidden). Chat uses `MessageScroller` / `Message` / `Bubble` / `Marker`.
- Add primitives with `npx shadcn@latest add <name>` from `frontend/`, then replace any `from "cn"` import with `@/lib/utils`, check the icon library is Tabler, and re-theme sizes (inputs h-12, text-label/body).

## Adding a new component

Write its spec first in `docs/design-system.md` using the «مكوّن جديد» template: problem, related components and why they are not enough, props, variants (≤ 5), states (default, hover, focus, active, disabled, loading, error, empty), tokens used, accessibility, open questions. Put it in the file of the domain that owns it (`src/components/rafeeq/<domain>.tsx`), export it from `index.ts`, add a `Demo` to the gallery, then run the checks.

## Reviews

For visual direction use the official `frontend-design` plugin (install from the Claude Code plugin directory). For a design review, critique or handoff, use the design skills in `.claude/skills/` (`design-critique`, `design-handoff`, `ux-copy`, `accessibility-review`, `design-system`, `interaction-design`, `ux-writing`), but apply Rafeeq's overrides above: they win over generic advice (for example "tracking-tight on headings" does not apply to Arabic). Before a demo, run `token-compliance` and `accessibility-per-component` on the five most-used components.
