/**
 * PLT-14 «صفحة التعريف والشعار». R1 and R2 are checked on the static
 * landing source (public/landing); R3 on RafeeqLogo. The visual behaviour
 * (scroll, live theme switch) was checked in a browser; see the PR.
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { RafeeqLogo } from "@/components/rafeeq"
import landingHtml from "../../public/landing/index.html?raw"
import landingJs from "../../public/landing/landing.js?raw"

const landing = (f: "index.html" | "landing.js") => (f === "index.html" ? landingHtml : landingJs)
const doc = () => new DOMParser().parseFromString(landing("index.html"), "text/html")

afterEach(cleanup)

describe("PLT-14 R1: the hero button reads on to the next section", () => {
  it("test_plt14_r1_hero_button_scrolls_to_learn_not_the_app", () => {
    const a = doc().querySelector(".hero__actions a")!
    expect(a.getAttribute("href")).toBe("#learn")
    expect(a.getAttribute("data-scroll-to")).toBe("learn")
    expect(a.hasAttribute("data-start")).toBe(false)
    expect(doc().getElementById("learn")).not.toBeNull()
  })

  it("test_plt14_r1_app_entry_stays_in_bar_and_at_the_end", () => {
    expect(doc().querySelector(".bar [data-start]")).not.toBeNull()
    expect(doc().querySelector(".bloom [data-start]")).not.toBeNull()
  })

  it("test_plt14_r1_scroll_respects_reduced_motion", () => {
    expect(landing("landing.js")).toMatch(/behavior: RM \? "instant" : "smooth"/)
  })

  it("test_plt14_r1_hero_button_label_in_every_language", () => {
    const js = landing("landing.js")
    expect(js.match(/"hero\.more":/g)?.length).toBe(2) // en + tl; ar is in the HTML
    expect(doc().querySelector('[data-i18n="hero.more"]')?.textContent).toBe("تعرّف على رفيق")
  })
})

describe("PLT-14 R2: natural Arabic, no promise of unbuilt features", () => {
  const text = () => doc().body.textContent ?? ""
  it.each(["في عالم يتسارع", "ليس مجرد", "رحلة استثنائية", "مركز التنزيل", "كل شهر تتعلّم"])(
    "test_plt14_r2_no_cliche_or_untrue_claim: %s",
    (phrase) => expect(text()).not.toContain(phrase),
  )
})

describe("PLT-14 R3: the logo follows the visible mode", () => {
  it("test_plt14_r3_light_surface_shows_the_colour_logo_dark_shows_reverse", () => {
    const { container } = render(<RafeeqLogo variant="horizontal" />)
    const light = container.querySelector('[data-logo-tone="light"]')!
    const dark = container.querySelector('[data-logo-tone="dark"]')!
    expect(light.getAttribute("src")).toMatch(/horizontal-color/)
    expect(light.className.split(" ")).toContain("dark:hidden")
    expect(dark.getAttribute("src")).toMatch(/horizontal-reverse/)
    expect(dark.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "dark:block"]))
  })

  it("test_plt14_r3_every_lockup_with_a_reverse_swaps", () => {
    for (const variant of ["horizontal", "vertical", "international"] as const) {
      const { container, unmount } = render(<RafeeqLogo variant={variant} />)
      expect(container.querySelectorAll("img")).toHaveLength(2)
      expect(container.querySelector('[data-logo-tone="dark"]')?.getAttribute("src")).toMatch(new RegExp(`${variant}-reverse`))
      unmount()
    }
  })

  it("test_plt14_r3_explicit_reverse_stays_reverse", () => {
    const { container } = render(<RafeeqLogo variant="horizontal-reverse" />)
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/horizontal-reverse/)
  })

  it("test_plt14_r3_layout_classes_reach_the_wrapper", () => {
    const { container } = render(<RafeeqLogo variant="horizontal" className="hidden w-32 min-w-32" />)
    const wrap = container.querySelector('[data-slot="rafeeq-logo"]')!
    expect(wrap.className).toContain("w-32")
    expect(wrap.className).toContain("hidden")
    expect(wrap.className).not.toContain("inline-block")
  })
})
