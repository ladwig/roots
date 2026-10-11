import { test } from "node:test"
import assert from "node:assert/strict"
import { fromLocalInput, toLocalInput } from "./time.ts"

test("Berlin wall clock ↔ UTC, summer and winter", () => {
  assert.equal(fromLocalInput("2026-07-01T20:00").toISOString(), "2026-07-01T18:00:00.000Z") // CEST +2
  assert.equal(fromLocalInput("2026-12-01T20:00").toISOString(), "2026-12-01T19:00:00.000Z") // CET +1
  assert.equal(toLocalInput("2026-07-01T18:00:00Z"), "2026-07-01T20:00")
  assert.equal(toLocalInput("2026-12-01T19:00:00Z"), "2026-12-01T20:00")
  assert.equal(toLocalInput(fromLocalInput("2026-10-25T01:30")), "2026-10-25T01:30") // night of the DST switch
  assert.equal(fromLocalInput("garbage"), null)
})
