type Times = { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string; hijri: string }

declare const fixture: {
  source: string
  url: string
  cities: Record<string, [number, number]>
  days: Record<string, Record<string, Times>>
}
export default fixture
