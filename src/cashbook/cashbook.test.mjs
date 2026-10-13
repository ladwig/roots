import assert from "node:assert/strict"
import { test } from "node:test"
import { cents, readEntry } from "./fields.ts"

test("cash book: amounts and entries", () => {
  assert.equal(cents("12,50"), 1250)
  assert.equal(cents("1.234,5"), 123450)
  assert.equal(cents("12.5 €"), 1250)
  assert.equal(cents("0"), null)
  assert.equal(cents("abc"), null)
  const out = readEntry({ direction: "out", amount: "25", booked_on: "2026-10-01", description: " Getränke ", sphere: "commercial" })
  assert.deepEqual(out, { row: { booked_on: "2026-10-01", amount_cents: -2500, description: "Getränke", category: null, sphere: "commercial", counterparty: null } })
  assert.deepEqual(readEntry({ direction: "in", amount: "5", booked_on: "2026-10-01", description: "" }), { error: "cashbook.descriptionRequired" })
})
