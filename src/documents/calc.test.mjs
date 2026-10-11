import { test } from "node:test"
import assert from "node:assert/strict"
import { lineNet, totals } from "./calc.ts"

test("line net rounds per line", () => {
  assert.equal(lineNet({ quantity: 1.5, unit_price: 3333, tax_rate: 19 }), 5000)
  assert.equal(lineNet({ quantity: 0.333, unit_price: 100, tax_rate: 19 }), 33)
})

test("totals per tax rate", () => {
  const t = totals(
    [
      { quantity: 2, unit_price: 10000, tax_rate: 19 },
      { quantity: 1, unit_price: 5000, tax_rate: 7 },
      { quantity: 1, unit_price: 999, tax_rate: 19 },
      { quantity: 1, unit_price: 1000, tax_rate: 0 },
    ],
    false,
  )
  assert.equal(t.net, 26999)
  assert.deepEqual(t.taxes, [
    { rate: 19, net: 20999, tax: 3990 },
    { rate: 7, net: 5000, tax: 350 },
  ])
  assert.equal(t.tax, 4340)
  assert.equal(t.gross, 31339)
})

test("Kleinunternehmer: no tax at all", () => {
  const t = totals([{ quantity: 1, unit_price: 10000, tax_rate: 19 }], true)
  assert.deepEqual([t.net, t.tax, t.gross, t.taxes.length], [10000, 0, 10000, 0])
})
