import assert from "node:assert/strict"
import { test } from "node:test"
import { period } from "./period.ts"

test("report periods", () => {
  assert.deepEqual(period("2026-10-13"), { preset: "month", from: "2026-10-01", to: "2026-10-31" })
  assert.deepEqual(period("2026-10-13", "30d"), { preset: "30d", from: "2026-09-14", to: "2026-10-13" })
  assert.deepEqual(period("2026-01-13", "last_month"), { preset: "last_month", from: "2025-12-01", to: "2025-12-31" })
  assert.deepEqual(period("2026-05-02", "quarter"), { preset: "quarter", from: "2026-04-01", to: "2026-06-30" })
  assert.deepEqual(period("2026-10-13", null, "2026-12-31", "2026-01-01"), { preset: "custom", from: "2026-01-01", to: "2026-12-31" })
  assert.equal(period("2026-10-13", "nope", "x", "y").preset, "month")
})
