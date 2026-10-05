# Rafeeq design system

shadcn/ui (radix-nova) + Tailwind CSS v4 + React 19, Arabic-first (RTL), with Rafeeq's brand tokens and domain components. Feature `PLT-04`, owner: ناصر بن خالد العويمر.

```bash
npm install
npm run dev            # gallery: tokens, primitives, Rafeeq components, screens
npm run build          # typecheck + production build
npm run check:design   # RTL and token guard (physical classes, raw colours, tracking)
npm run lint:design-md # validate DESIGN.md (references + WCAG contrast)
npm run build:review   # single-file review HTML (review/ committed without Thmanyah; dist-review/ local with it)
```

Open `review/rafeeq-design-system.html` in any browser to review every component and leave notes (saved in the browser, copy all with «ملاحظاتك»).

Deep links: `?tab=foundations|primitives|rafeeq|screens`, `&dir=ltr`, `&theme=dark`.

| Path | What |
| --- | --- |
| `DESIGN.md` | Token and rules contract (Google DESIGN.md format) |
| `src/styles/tokens.css` | Layer 1: brand primitives from the brand guide (`--rf-*`) |
| `src/index.css` | Layer 2: semantic tokens for light/dark; layer 3: `@theme inline` utilities |
| `src/components/ui/` | shadcn primitives, re-themed (pill buttons, 48px inputs, 20px cards, brand type scale) |
| `src/components/rafeeq/` | Rafeeq components, one file per domain |
| `src/gallery/` | The gallery pages (also usage examples) |
| `public/brand/`, `src/assets/brand/` | Official logo pack and app icons |

Human reference (Arabic): `../docs/design-system.md`. Agent skill: `../skills/rafeeq-design-system/SKILL.md`.

## Adding shadcn components

```bash
npx shadcn@latest add <name>
```

Then: replace any `import { cn } from "cn"` with `@/lib/utils` (the preset injects it) and remove the `cn` package if it was added, keep Tabler icons, and re-theme sizes to the brand scale (`text-label`/`text-body`, inputs `h-12`, `rounded-md`).

## Fonts

Thmanyah is the brand font. Its licence (font.thmanyah.com/licenses) allows bundling it in our app but forbids redistributing, hosting for download, or modifying the files. Download it from font.thmanyah.com, copy the official woff2 files (names unchanged) into `public/fonts/thmanyah/` (git-ignored, never commit). Until then the app falls back to IBM Plex Sans Arabic and Noto Naskh Arabic (SIL OFL, self-hosted via `@fontsource`).

## Visual direction

«زهرة تكتمل»: brand graphics generated from the logo petal (`src/components/rafeeq/graphics.tsx`), a night-sky Home hero, tactile lips on pressable surfaces (`tactile` utility in `src/index.css`), and an adaptive `AppShell` (container queries: bottom nav < 840px, rail + pane ≥ 840px). Motion and mobile rules come from Emil Kowalski's `animate` and `mobile-native` skills (vendored in `../.claude/skills/`).
