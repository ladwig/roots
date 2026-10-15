import assert from "node:assert/strict"
import { test } from "node:test"
import { familyOf, noticeEnd, readObject, readRate, readRental, rentalState, wordFor } from "./fields.ts"

const form = (o) => (k) => o[k] ?? ""

test("rentals: kinds, wording, parsing, state, notice", () => {
  assert.equal(familyOf("key"), "access")
  assert.equal(familyOf("Spielkiste"), "other")
  assert.equal(wordFor("place", "month"), "contract")
  assert.equal(wordFor("place", "hour"), "booking")
  assert.equal(wordFor("item", "day"), "loan")
  assert.equal(wordFor("access"), "handout")

  const o = readObject(form({ name: "Schlüssel A-1", kind: "key", deposit: "20", lendable: "on" }))
  assert.equal(o.row.family, "access")
  assert.equal(o.row.deposit_cents, 2000)
  assert.ok("error" in readObject(form({ name: " " })))

  const r = readRate(form({ name: "Langzeit", unit: "month", price: "800", notice_months: "3", term_months: "12", renew_months: "12" }))
  assert.deepEqual([r.row.price_cents, r.row.notice_months, r.row.renew_months], [80000, 3, 12])
  assert.equal(readRate(form({ name: "Stunde", unit: "hour", price: "15", notice_months: "3" })).row.notice_months, null) // short term: no notice

  assert.ok("error" in readRental(form({ starts_at: "2026-05-02T10:00:00Z", ends_at: "2026-05-01T10:00:00Z" })))
  assert.ok("error" in readRental(form({ starts_at: "2026-05-01T10:00:00Z", renew_months: "12" }))) // renewing needs an end
  assert.equal(readRental(form({ starts_at: "2026-05-01T10:00:00Z", price: "1.234,50" })).row.price_cents, 123450)

  const now = new Date("2026-06-01T12:00:00Z")
  assert.equal(rentalState({ status: "confirmed", starts_at: "2026-01-01T00:00:00Z", ends_at: null }, now), "running")
  assert.equal(rentalState({ status: "confirmed", starts_at: "2026-07-01T00:00:00Z", ends_at: null }, now), "upcoming")
  assert.equal(rentalState({ status: "confirmed", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-05-01T00:00:00Z" }, now), "ended")

  assert.equal(noticeEnd({ ends_at: null, notice_months: 3 }, "2026-06-15"), "2026-09-30")
  assert.equal(noticeEnd({ ends_at: "2027-02-28T23:00:00Z", notice_months: 3 }, "2026-06-15"), "2027-02-28") // fixed term ends later
})
