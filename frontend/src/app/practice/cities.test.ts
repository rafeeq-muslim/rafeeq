/** PRC-01 R2 (offline city list) and the 48° limit. */
import { describe, expect, it } from "vitest"

import rows from "./cities.json"
import { nearestCity, searchCities, suggestCities, toCity } from "./cities"

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

describe("PRC-01 «خارج النطاق»: high latitudes", () => {
  it("lists no city above 48° north or south (London is not offered yet)", () => {
    expect(rows.every((r) => Math.abs(r.lat) <= 48)).toBe(true)
    expect(searchCities(rows, "London")).toEqual([])
  })
})
