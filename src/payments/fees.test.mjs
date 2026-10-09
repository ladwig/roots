import { test } from "node:test"
import assert from "node:assert/strict"
import { applicationFee } from "./fees.ts"

test("application fee", () => {
  const cfg = { percent: 1.5, fixedCents: 25 }
  assert.equal(applicationFee(1000, cfg), 40) // 15 + 25
  assert.equal(applicationFee(333, cfg), 30) // 4.995 → 5, + 25
  assert.equal(applicationFee(0, cfg), 0) // free orders cost nothing
  assert.equal(applicationFee(10, cfg), 10) // capped at the order total
  assert.equal(applicationFee(1000, { percent: 0, fixedCents: 0 }), 0)
})
