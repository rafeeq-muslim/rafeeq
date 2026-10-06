import { describe, expect, it } from "vitest"

import { isAligned, screenHeading, smoothHeading, turnToQibla, unwrapRotation, wrap360 } from "./compass"

describe("prc01 r5 live compass", () => {
  it("test_prc01_r5_turn_is_the_shortest_way_with_its_side", () => {
    // Riyadh: qibla 244°. Facing north → turn left 116°, not right 244°.
    expect(turnToQibla(244, 0)).toBe(-116)
    // Facing 200° → turn right 44°.
    expect(turnToQibla(244, 200)).toBe(44)
    // Across north: qibla 10°, facing 350° → turn right 20°.
    expect(turnToQibla(10, 350)).toBe(20)
  })

  it("test_prc01_r5_aligned_within_five_degrees", () => {
    expect(isAligned(244, 240)).toBe(true)
    expect(isAligned(244, 249)).toBe(true)
    expect(isAligned(244, 250)).toBe(false)
    expect(isAligned(2, 358)).toBe(true)
  })

  it("test_prc01_r5_smoothing_does_not_jump_across_north", () => {
    expect(smoothHeading(null, 370)).toBe(10)
    const s = smoothHeading(359, 1, 0.5)
    expect(s).toBeCloseTo(0, 6)
  })

  it("test_prc01_r5_dial_rotation_keeps_turning_the_short_way", () => {
    // At -350° (shows 10°), heading target 350° → goes to -370°, not +350°.
    expect(unwrapRotation(-350, 350)).toBe(-370)
    expect(wrap360(unwrapRotation(720, 90))).toBe(90)
  })

  it("test_prc01_r5_landscape_screen_adds_its_rotation", () => {
    expect(screenHeading(350, 90)).toBe(80)
    expect(screenHeading(10, 0)).toBe(10)
  })
})
