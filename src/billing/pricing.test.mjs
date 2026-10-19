import assert from "node:assert/strict"
import { test } from "node:test"
import { FREE, monthlyBill, monthRange, priceFor, salesFee } from "./pricing.ts"

test("monthRange", () => {
  assert.deepEqual(monthRange("2026-10"), { from: "2026-10-01", to: "2026-11-01" })
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" })
})

test("priceFor: own price from its month, else the default, else none", () => {
  const own = [{ starts_on: "2026-11-01", id: "own-nov" }, { starts_on: "2027-01-01", id: "own-jan" }]
  const defaults = [{ starts_on: "2026-01-01", id: "def" }]
  assert.equal(priceFor(own, defaults, "2026-10-01").id, "def")
  assert.equal(priceFor(own, defaults, "2026-12-01").id, "own-nov")
  assert.equal(priceFor(own, defaults, "2027-03-01").id, "own-jan")
  assert.equal(priceFor([], [], "2026-10-01"), null)
})

test("salesFee: percent + fixed, capped, free orders cost nothing", () => {
  const p = { sales_percent: 1.5, sales_fixed_cents: 25 }
  assert.equal(salesFee(1000, p), 40)
  assert.equal(salesFee(333, p), 30)
  assert.equal(salesFee(0, p), 0)
  assert.equal(salesFee(10, p), 10)
})

test("monthlyBill: allowances, modules, open fees, discount", () => {
  const p = { ...FREE, base_cents: 2000, module_cents: { events: 500, hr: 1000 }, user_cents: 300, included_users: 3, member_cents: 10, included_members: 100, discount_percent: 50 }
  const b = monthlyBill(p, { users: 5, members: 150, modules: ["events", "crm"], fees_open_cents: 1000 })
  assert.deepEqual(b, { base: 2000, modules: 500, users: 600, members: 500, subscription: 3600, feesOpen: 1000, discount: 2300, total: 2300 })
  assert.equal(monthlyBill({ ...p, discount_percent: 100 }, { users: 9, members: 999, modules: ["hr"], fees_open_cents: 50 }).total, 0)
})
