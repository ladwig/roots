import test from "node:test"
import assert from "node:assert/strict"
import { readDoor, readLines, lineTotal } from "./door-fields.ts"

const T = "11111111-1111-1111-1111-111111111111"

test("door settings: all methods by default, filters junk", () => {
  assert.deepEqual(readDoor({}).methods, ["cash", "qr", "terminal"])
  assert.deepEqual(readDoor({ methods: ["qr", "bitcoin"], cash_account_id: "x" }), { methods: ["qr"], reader_id: null, cash_account_id: null })
})

test("door lines: tickets and free amounts, rejects bad input", () => {
  const lines = readLines([{ typeId: T, price: 1500, quantity: 2 }, { label: "Getränk", price: 350, quantity: 1 }])
  assert.equal(lines.length, 2)
  assert.equal(lineTotal(lines), 3350)
  assert.equal(readLines([{ price: 100, quantity: 1 }]), null) // neither type nor label
  assert.equal(readLines([{ typeId: T, price: -1, quantity: 1 }]), null)
  assert.equal(readLines([{ typeId: T, price: 1.5, quantity: 1 }]), null)
  assert.equal(readLines([{ typeId: T, price: 100, quantity: 101 }]), null)
  assert.equal(readLines([]), null)
})
