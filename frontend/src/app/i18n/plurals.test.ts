import { describe, expect, it } from "vitest"
import { translate } from "./index"

describe("plural forms (issue #9)", () => {
  it("Arabic streak counts read naturally", () => {
    expect(translate("ar", "streak.days", { n: "1" })).toBe("سلسلتك يوم واحد")
    expect(translate("ar", "streak.days", { n: "2" })).toBe("سلسلتك يومان")
    expect(translate("ar", "streak.days", { n: "3" })).toBe("سلسلتك 3 أيام")
    expect(translate("ar", "streak.days", { n: "11" })).toBe("سلسلتك 11 يومًا")
    expect(translate("ar", "streak.days", { n: "100" })).toBe("سلسلتك 100 يوم")
  })
  it("English singular, and keys without forms are untouched", () => {
    expect(translate("en", "path.lessonsCount", { n: "1" })).toBe("1 lesson")
    expect(translate("en", "path.lessonsCount", { n: "4" })).toBe("4 lessons")
    expect(translate("ar", "home.day", { n: "1" })).toBe("يومك 1 مع رفيق")
  })
})
