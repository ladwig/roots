import { test } from "node:test"
import assert from "node:assert/strict"
import { parsePrice, priceInput } from "./price.ts"

test("prices", () => {
  assert.equal(parsePrice("12,50"), 1250)
  assert.equal(parsePrice("12.5"), 1250)
  assert.equal(parsePrice("0"), 0)
  assert.equal(parsePrice("19,99"), 1999)
  assert.equal(parsePrice("-1"), null)
  assert.equal(parsePrice("1,234"), null)
  assert.equal(parsePrice("abc"), null)
  assert.equal(priceInput(1250), "12,50")
})
