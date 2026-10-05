import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge our type scale (index.css @theme). Without this it
// reads `text-label` / `text-body` as colours and drops the real text colour
// when both are present (e.g. a large button lost text-primary-foreground).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h1", "h2", "h3", "reading", "body", "label", "caption"] },
      ],
      shadow: [{ shadow: ["card", "raised", "glow"] }],
      rounded: [{ rounded: ["card", "panel"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
