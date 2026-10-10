import { test } from "node:test"
import assert from "node:assert/strict"
import { occurrences, workedMinutes } from "./series.ts"

test("every 2nd Thursday, night shift past midnight, DST", () => {
  const s = { weekdays: [4], every_weeks: 2, start_date: "2026-10-01", end_date: null, start_time: "22:00", end_time: "04:00" }
  const o = occurrences(s, "2026-10-01", "2026-11-12")
  assert.deepEqual(o.map((x) => x.date), ["2026-10-01", "2026-10-15", "2026-10-29", "2026-11-12"])
  assert.equal(o[0].starts_at, "2026-10-01T20:00:00.000Z") // CEST
  assert.equal(o[0].ends_at, "2026-10-02T02:00:00.000Z")
  assert.equal(o[2].starts_at, "2026-10-29T21:00:00.000Z") // CET after DST end
})

test("weekdays, window and end date", () => {
  const s = { weekdays: [1, 2, 3, 4, 5], every_weeks: 1, start_date: "2026-10-05", end_date: "2026-10-09", start_time: "08:00", end_time: "16:00" }
  assert.equal(occurrences(s, "2026-10-01", "2026-12-31").length, 5)
  assert.equal(occurrences(s, "2026-10-07", "2026-12-31").length, 3)
})

test("worked minutes", () => {
  assert.equal(workedMinutes({ checked_in_at: "2026-10-01T20:00:00Z", checked_out_at: "2026-10-01T23:30:00Z" }, "2026-10-02T02:00:00Z"), 210)
  assert.equal(workedMinutes({ checked_in_at: "2026-10-01T20:00:00Z", checked_out_at: null }, "2026-10-02T02:00:00Z"), 360)
  assert.equal(workedMinutes({ checked_in_at: null, checked_out_at: null }, "2026-10-02T02:00:00Z"), 0)
})
