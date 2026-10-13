import assert from "node:assert/strict"
import { test } from "node:test"
import { legalBreak, minutes, warnings } from "./time.ts"

const e = (id, start, end, brk = null) => ({ id, started_at: start, ended_at: end, break_minutes: brk })

test("legal breaks and net time", () => {
  assert.equal(legalBreak(360), 0)
  assert.equal(legalBreak(361), 30)
  assert.equal(legalBreak(541), 45)
  assert.deepEqual(minutes(e("a", "2026-10-01T08:00:00Z", "2026-10-01T16:00:00Z")), { gross: 480, break: 30, net: 450, auto: true })
  assert.deepEqual(minutes(e("a", "2026-10-01T08:00:00Z", "2026-10-01T16:00:00Z", 60)), { gross: 480, break: 60, net: 420, auto: false })
  assert.equal(minutes(e("a", "2026-10-01T08:00:00Z", null), Date.parse("2026-10-01T09:00:00Z")).net, 60)
})

test("warnings: short manual break, long day, short rest, forgotten check-out", () => {
  const w = warnings(
    [
      e("short", "2026-10-01T08:00:00Z", "2026-10-01T16:00:00Z", 10),
      e("late", "2026-10-01T17:00:00Z", "2026-10-01T21:00:00Z"),
      e("early", "2026-10-02T04:00:00Z", "2026-10-02T06:00:00Z"),
      e("open", "2026-10-03T08:00:00Z", null),
    ],
    Date.parse("2026-10-04T08:00:00Z"),
  )
  assert.deepEqual(w.get("short"), ["break_short", "day_over_10h"])
  assert.deepEqual(w.get("late"), ["day_over_10h"])
  assert.deepEqual(w.get("early"), ["rest_short"])
  assert.deepEqual(w.get("open"), ["still_open"])
})
