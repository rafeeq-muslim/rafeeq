/**
 * PLT-04 R4: every semantic text colour on its surface reaches WCAG AA in
 * both themes (4.5:1; 3:1 for icons), including every gradient stop under
 * text and the strongest point of the backdrop. Reads the real tokens from
 * tokens.css and index.css, so a token change that breaks contrast fails here.
 */
import { describe, expect, it } from "vitest"

import tokensCss from "./tokens.css?raw"
import indexCss from "../index.css?raw"

type RGBA = [number, number, number, number] // sRGB 0–1, alpha 0–1

const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")
const tokens = uncomment(tokensCss)
const index = uncomment(indexCss)

function declarations(src: string, selector: string): Record<string, string> {
  const start = src.indexOf(`\n${selector} {`)
  const body = src.slice(start, src.indexOf("\n}", start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const primitives = declarations(tokens, ":root")
const light = declarations(index, ":root")
const dark = declarations(index, ".dark")
const scopes = { light: [light, primitives], dark: [dark, light, primitives] }

/** Split on commas outside parentheses. */
function args(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ""
  for (const ch of s) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  return [...out, cur.trim()]
}
const inner = (s: string) => s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"))

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
function toOklab([r, g, b]: RGBA) {
  const [R, G, B] = [r, g, b].map(toLin)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromOklab([L, A, B]: number[], alpha = 1): RGBA {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  const [r, g, b] = rgb.map((v) => Math.min(1, Math.max(0, toGamma(v))))
  return [r, g, b, alpha]
}

function color(value: string, scope: Record<string, string>[]): RGBA {
  const v = value.trim()
  if (v.startsWith("var(")) {
    const name = inner(v).trim().replace(/^--/, "")
    const found = scope.find((d) => name in d)
    if (!found) throw new Error(`unknown token --${name}`)
    return color(found[name], scope)
  }
  if (v.startsWith("#")) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).concat(1) as RGBA
  if (v === "white") return [1, 1, 1, 1]
  if (v === "black") return [0, 0, 0, 1]
  if (v === "transparent") return [0, 0, 0, 0]
  if (v.startsWith("rgb(")) {
    const [rgb, a = "1"] = inner(v).split("/")
    const [r, g, b] = rgb.trim().split(/\s+/).map((n) => Number(n) / 255)
    return [r, g, b, Number(a)]
  }
  if (v.startsWith("color-mix(")) {
    const [, a, b] = args(inner(v))
    const pct = (part: string) => (/\s(\d+(?:\.\d+)?)%$/.test(part) ? Number(part.match(/\s(\d+(?:\.\d+)?)%$/)![1]) / 100 : null)
    const strip = (part: string) => part.replace(/\s\d+(?:\.\d+)?%$/, "")
    const p = pct(a) ?? 1 - (pct(b) ?? 0.5)
    const ca = color(strip(a), scope)
    const cb = color(strip(b), scope)
    if (cb[3] === 0) return [ca[0], ca[1], ca[2], ca[3] * p]
    const [x, y] = [toOklab(ca), toOklab(cb)]
    return fromOklab(x.map((n, i) => n * p + y[i] * (1 - p)))
  }
  throw new Error(`cannot read colour ${v}`)
}

/** Colour stops of one or more gradients, transparent stops dropped. */
function stops(value: string, scope: Record<string, string>[]): RGBA[] {
  return args(value).flatMap((gradient) =>
    args(inner(gradient))
      .filter((part) => !/^(\d|to |at |circle|ellipse)/.test(part) && !/deg$/.test(part))
      .map((part) => color(part.replace(/(\s+-?\d+(?:\.\d+)?(%|rem|px))+$/, ""), scope))
      .filter((c) => c[3] > 0),
  )
}

const over = (top: RGBA, base: RGBA): RGBA => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1) as RGBA
const lum = ([r, g, b]: RGBA) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
const ratio = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Text token on surface token; translucent surfaces sit on `under`. */
const PAIRS: [text: string, surface: string, under: string, min: number][] = [
  ["foreground", "background", "background", 4.5],
  ["foreground", "card", "background", 4.5],
  ["muted-foreground", "background", "background", 4.5],
  ["muted-foreground", "card", "background", 4.5],
  ["muted-foreground", "muted", "card", 4.5],
  ["muted-foreground", "secondary", "card", 4.5],
  ["primary", "background", "background", 4.5],
  ["primary", "card", "background", 4.5],
  ["primary-foreground", "primary", "card", 4.5],
  ["secondary-foreground", "secondary", "card", 4.5],
  ["accent-foreground", "accent", "card", 4.5],
  ["celebrate-foreground", "celebrate", "card", 4.5],
  ["celebrate-surface-foreground", "celebrate-surface", "card", 4.5],
  ["success", "success-surface", "card", 4.5],
  ["warning", "warning-surface", "card", 4.5],
  ["destructive", "danger-surface", "card", 4.5],
  ["info", "info-surface", "card", 4.5],
]
const GRADIENTS: [text: string, gradient: string, min: number][] = [
  ["primary-foreground", "grad-action", 4.5],
  ["celebrate-foreground", "grad-celebrate", 4.5],
  ["secondary-foreground", "grad-secondary", 4.5],
  ["tile-foreground", "grad-tile", 3],
  ["tile-foreground", "grad-tile-rtl", 3],
]
const ON_BACKDROP = ["foreground", "muted-foreground", "primary"]

describe.each(["light", "dark"] as const)("plt-04 r4 contrast, %s theme", (theme) => {
  const scope = scopes[theme]
  const c = (name: string) => color(`var(--${name})`, scope)

  it.each(PAIRS)("%s on %s", (text, surface, under, min) => {
    const bg = over(c(surface), over(c(under), c("background")))
    expect(ratio(over(c(text), bg), bg)).toBeGreaterThanOrEqual(min)
  })

  it.each(GRADIENTS)("%s on every stop of %s", (text, gradient, min) => {
    for (const stop of stops(scope.find((d) => gradient in d)![gradient], scope)) {
      const bg = over(stop, c("card"))
      expect(ratio(over(c(text), bg), bg)).toBeGreaterThanOrEqual(min)
    }
  })

  it.each(["backdrop", "backdrop-rtl"])("text on the strongest point of the %s", (name) => {
    const washes = stops(scope.find((d) => name in d)![name], scope)
    expect(washes.length).toBeGreaterThan(0)
    for (const wash of washes) {
      const bg = over(wash, c("background"))
      for (const text of ON_BACKDROP) expect(ratio(over(c(text), bg), bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
