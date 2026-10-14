import assert from "node:assert/strict"
import { test } from "node:test"
import { bicValid, formatIban, formatMoney, ibanValid, moneyCents, phoneValid, postcodeValid } from "./inputs.ts"

test("inputs: IBAN, BIC, postcode, phone, money", () => {
  assert.equal(ibanValid("DE89 3704 0044 0532 0130 00"), true)
  assert.equal(ibanValid("DE89 3704 0044 0532 0130 01"), false) // typo → check digits fail
  assert.equal(ibanValid("DE89 3704 0044 0532 0130"), false) // too short for DE
  assert.equal(ibanValid("GB82 WEST 1234 5698 7654 32"), true)
  assert.equal(formatIban("de89370400440532013000"), "DE89 3704 0044 0532 0130 00")
  assert.equal(bicValid("COBADEFFXXX"), true)
  assert.equal(bicValid("COBADEF"), false)
  assert.equal(postcodeValid("10115"), true)
  assert.equal(postcodeValid("1011"), false)
  assert.equal(postcodeValid("SW1A 1AA", "GB"), true)
  assert.equal(phoneValid("+49 30 123456"), true)
  assert.equal(phoneValid("030 abc"), false)
  assert.equal(moneyCents("1.234,5"), 123450)
  assert.equal(moneyCents("0"), 0)
  assert.equal(moneyCents("12,345"), null)
  assert.equal(formatMoney(123450), "1.234,50")
})
