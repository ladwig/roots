import { test } from "node:test"
import assert from "node:assert/strict"
import { formatDate, parseDate, parseTime } from "./date-input.ts"

test("German dates and 24h times", () => {
  assert.equal(parseDate("4.11.26"), "2026-11-04")
  assert.equal(parseDate("04.11.2026"), "2026-11-04")
  assert.equal(parseDate("2026-11-04"), "2026-11-04")
  assert.equal(parseDate("31.02.2026"), null)
  assert.equal(parseDate("11/04/2026"), "2026-04-11") // day first, always
  assert.equal(formatDate("2026-11-04"), "04.11.2026")
  assert.equal(parseTime("9"), "09:00")
  assert.equal(parseTime("930"), "09:30")
  assert.equal(parseTime("19.30 Uhr"), "19:30")
  assert.equal(parseTime("24:00"), null)
})
