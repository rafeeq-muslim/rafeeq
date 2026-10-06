/**
 * Issue #9 item 18: Arabic quoted inside English or Filipino text flips the
 * quote marks and punctuation around it («Ano ang kahulugan ng “لا إله إلا
 * الله”?»). Each Arabic run is isolated at display time with the Unicode
 * isolates (RLI U+2067 … PDI U+2069); the stored text is unchanged.
 */
const AR = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF"
// An Arabic run: Arabic letters, and spaces or Arabic punctuation between them.
const RUN = new RegExp(`[${AR}]+(?:[\\s\\u060C\\u061B\\u061F]+[${AR}]+)*`, "g")
const RLI = "⁧"
const PDI = "⁩"

export function isolateArabic(text: string): string {
  if (text.includes(RLI)) return text // already isolated
  return text.replace(RUN, (run) => RLI + run + PDI)
}

/** Every string in a value (e.g. the lesson content), for a left-to-right language. */
export function isolateDeep<T>(value: T): T {
  if (typeof value === "string") return isolateArabic(value) as T
  if (Array.isArray(value)) return value.map(isolateDeep) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isolateDeep(v)])) as T
  }
  return value
}
