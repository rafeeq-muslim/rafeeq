# Rafeeq design system

shadcn/ui (radix-nova) + Tailwind CSS v4 + React 19, Arabic-first (RTL), with Rafeeq's brand tokens and domain components. Feature `PLT-04`, owner: ناصر بن خالد العويمر.

```bash
npm install
npm run dev            # gallery: tokens, primitives, Rafeeq components, screens
npm run build          # typecheck + production build
npm run check:design   # RTL and token guard (physical classes, raw colours, tracking)
npm run lint:design-md # validate DESIGN.md (references + WCAG contrast)
```

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

Thmanyah is the brand font. Its licence does not allow hosting the files, so it is listed first in the font stack and used only where installed locally. The gallery ships IBM Plex Sans Arabic and Noto Naskh Arabic (SIL OFL) via `@fontsource`, self-hosted.
