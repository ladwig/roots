import assert from "node:assert/strict"
import { test } from "node:test"
import { attendanceRate, readCourse, readSeries, readSession } from "./fields.ts"

const get = (o) => (k) => o[k] ?? ""

test("course input", () => {
  assert.deepEqual(readCourse(get({ title: " Yoga ", capacity: "12", track_attendance: "1" })).row, { title: "Yoga", description: null, instructor: null, location_id: null, capacity: 12, track_attendance: true })
  assert.equal(readCourse(get({ title: "" })).error, "courses.titleMissing")
  assert.equal(readCourse(get({ title: "x", capacity: "0" })).error, "courses.capacityInvalid")
  assert.equal(readCourse(get({ title: "x" })).row.capacity, null)
})

test("one date and weekly series (Berlin time)", () => {
  const s = readSession(get({ starts_at: "2026-10-13T18:00", ends_at: "2026-10-13T19:30" })).row
  assert.equal(s.starts_at, "2026-10-13T16:00:00.000Z")
  assert.equal(readSession(get({ starts_at: "2026-10-13T18:00", ends_at: "2026-10-13T17:00" })).error, "courses.endBeforeStart")
  const series = readSeries(get({ from: "2026-10-01", to: "2026-10-31", start_time: "18:00", end_time: "19:30" }), ["2"]) // Tuesdays
  assert.deepEqual(series.row.dates.map((d) => d.starts_at.slice(0, 10)), ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"])
  assert.equal(series.row.dates[3].starts_at, "2026-10-27T17:00:00.000Z") // after the switch to winter time
  assert.equal(readSeries(get({ from: "2026-10-01", to: "2026-10-31", start_time: "18:00", end_time: "19:00" }), []).error, "courses.pickWeekday")
  assert.equal(attendanceRate(3, 4), 75)
  assert.equal(attendanceRate(0, 0), null)
})
