/** PRC-01 R2 (offline city list) and the 48° limit. */
import { describe, expect, it } from "vitest"

import rows from "./cities.json"
import { distanceKm, locateCity, NEAREST_MAX_KM, nearestCity, searchCities, suggestCities, toCity } from "./cities"

describe("PRC-01 R2: offline city list", () => {
  it("suggests Riyadh first for a device in Asia/Riyadh, without asking for location", () => {
    expect(suggestCities(rows, "Asia/Riyadh")[0].n.en).toBe("Riyadh")
    expect(suggestCities(rows, "Asia/Manila")[0].n.en).toBe("Manila")
  })

  it("finds a city in the learner's language", () => {
    expect(searchCities(rows, "الرياض")[0].n.en).toBe("Riyadh")
    expect(searchCities(rows, "رياض")[0].n.en).toBe("Riyadh")
    expect(searchCities(rows, "maynila")[0].n.en).toBe("Manila")
    expect(searchCities(rows, "jedda")[0].n.en).toBe("Jeddah")
  })

  it("a village that is not listed returns no match (the screen offers the nearest city or location)", () => {
    expect(searchCities(rows, "Zzyzxville")).toEqual([])
  })

  it("location, if the learner allows it, only picks the nearest listed city", () => {
    const c = nearestCity(rows, 24.7, 46.7)!
    expect(toCity(c)).toMatchObject({ country: "SA", tz: "Asia/Riyadh", name: { en: "Riyadh", ar: "الرياض" } })
  })
})

describe("PRC-01 R2/R3: location never picks a far city in another time zone", () => {
  it.each([
    ["London", 51.507, -0.128],
    ["Oslo", 59.91, 10.75],
    ["Edmonton", 53.55, -113.49],
    ["Glasgow", 55.86, -4.25],
  ])("prc-01-r2 %s (above 48°) gets no city and an honest «not supported yet»", (_, lat, lng) => {
    // Before the limit: London → Lyon, Oslo → Milan, Edmonton → Seattle.
    expect(nearestCity(rows, lat, lng)).toBeNull()
    expect(locateCity(rows, lat, lng)).toEqual({ kind: "highLatitude" })
  })

  it("prc-01-r2 the limit is 150 km: Vancouver (195 km from Seattle) is refused, a village near Riyadh is not", () => {
    expect(NEAREST_MAX_KM).toBe(150)
    expect(distanceKm(49.28, -123.12, 47.61, -122.33)).toBeGreaterThan(150)
    expect(locateCity(rows, 49.28, -123.12)).toEqual({ kind: "highLatitude" })
    // Huraymila, a small town ≈ 77 km from Riyadh and not in the list: Riyadh is offered.
    expect(locateCity(rows, 25.12, 46.12)).toMatchObject({ kind: "city", row: { n: { en: "Riyadh" } } })
  })

  it("prc-01-r2 far from every listed city below 48° says so instead of guessing", () => {
    expect(locateCity(rows, -25.0, 133.0)).toEqual({ kind: "farAway" }) // central Australia, 1228 km from Adelaide
  })
})

describe("PRC-01 «خارج النطاق»: high latitudes", () => {
  it("lists no city above 48° north or south (London is not offered yet)", () => {
    expect(rows.every((r) => Math.abs(r.lat) <= 48)).toBe(true)
    expect(searchCities(rows, "London")).toEqual([])
  })
})
