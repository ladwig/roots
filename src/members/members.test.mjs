import assert from "node:assert/strict"
import { test } from "node:test"
import { coversPeriod, earliestEnd, periods } from "./dues.ts"
import { pain008, sepaText } from "./sepa.ts"

test("periods are calendar-aligned and start inside the range", () => {
  assert.deepEqual(periods("year", "2027-01-01", "2027-12-31"), [{ start: "2027-01-01", end: "2027-12-31" }])
  assert.deepEqual(periods("quarter", "2027-02-15", "2027-09-30").map((p) => p.start), ["2027-04-01", "2027-07-01"])
  assert.deepEqual(periods("month", "2027-11-01", "2028-01-31").map((p) => p.end), ["2027-11-30", "2027-12-31", "2028-01-31"])
  assert.deepEqual(periods("none", "2027-01-01", "2027-12-31"), [])
})

test("membership covers a period when they overlap", () => {
  const q = { start: "2027-04-01", end: "2027-06-30" }
  assert.ok(coversPeriod({ starts_on: "2027-05-10", ends_on: null }, q))
  assert.ok(!coversPeriod({ starts_on: "2026-01-01", ends_on: "2027-03-31" }, q))
})

test("earliest end: notice, then end of the billing period", () => {
  assert.equal(earliestEnd("2027-09-15", 3, "year"), "2027-12-31")
  assert.equal(earliestEnd("2027-10-01", 3, "year"), "2028-12-31")
  assert.equal(earliestEnd("2027-02-10", 1, "quarter"), "2027-03-31")
  assert.equal(earliestEnd("2027-02-10", 0, "none"), "2027-02-10")
})

test("pain.008 sums, counts and cleans names", () => {
  const xml = pain008({
    messageId: "ROOTS-1",
    createdAt: new Date("2027-01-02T10:00:00Z"),
    collectionOn: "2027-01-15",
    creditor: { name: "TSV Müller & Söhne e.V.", iban: "DE02120300000000202051", creditorId: "DE98ZZZ09999999999" },
    debits: [
      { id: "a", name: "Jörg Groß", iban: "DE02100100100006820101", mandateRef: "M000001", mandateDate: "2026-05-01", amountCents: 6000, text: "Beitrag 2027" },
      { id: "b", name: "Ana", iban: "DE02100100100006820101", bic: "PBNKDEFF", mandateRef: "M000002", mandateDate: "2026-05-01", amountCents: 1250, text: "Beitrag 2027" },
    ],
  })
  assert.match(xml, /<NbOfTxs>2<\/NbOfTxs><CtrlSum>72.50<\/CtrlSum>/)
  assert.match(xml, /<Nm>TSV Mueller \+ Soehne e.V.<\/Nm>/)
  assert.match(xml, /<Nm>Joerg Gross<\/Nm>/)
  assert.match(xml, /<Id>NOTPROVIDED<\/Id>/)
  assert.equal(sepaText("Café <b>", 70), "Cafe b")
})
