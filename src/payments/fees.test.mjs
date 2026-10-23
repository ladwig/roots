import assert from "node:assert/strict"
import { test } from "node:test"
import { readPassOn, serviceFee } from "./fees.ts"

test("serviceFee: covers percent on the whole amount + fixed", () => {
  const stripe = { percent: 1.5, fixedCents: 25 }
  const fee = serviceFee(2000, stripe)
  assert.equal(fee, 56) // 20,00 € → 20,56 €: Stripe takes 1,5 % of 20,56 (0,31) + 0,25 = 0,56
  const total = 2000 + fee
  assert.ok(total - Math.round(total * 0.015) - 25 >= 2000) // the org keeps at least the ticket price
  assert.equal(serviceFee(0, stripe), 0) // free orders: nothing
  assert.equal(serviceFee(2000, null), 0)
  assert.equal(serviceFee(1000, { percent: 2.5, fixedCents: 0 }), 26)
})

test("readPassOn: off unless switched on, defaults per provider, own values", () => {
  assert.equal(readPassOn("stripe", {}), null)
  assert.deepEqual(readPassOn("stripe", { pass_fees: true }), { percent: 1.5, fixedCents: 25 })
  assert.deepEqual(readPassOn("sumup", { pass_fees: true, fee_percent: 1.9, fee_fixed_cents: 10 }), { percent: 1.9, fixedCents: 10 })
  assert.equal(readPassOn("sumup", { pass_fees: true, fee_percent: 80 }), null)
})
