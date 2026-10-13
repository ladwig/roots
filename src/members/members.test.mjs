import assert from "node:assert/strict"
import { test } from "node:test"
import { billable, coversPeriod, earliestEnd, isPaused, periodFee, periods } from "./dues.ts"
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

test("pro-rata counts the months a membership touches", () => {
  const year = { start: "2027-01-01", end: "2027-12-31" }
  assert.equal(periodFee(6000, "year", year, { starts_on: "2027-11-15", ends_on: null }, true), 1000)
  assert.equal(periodFee(6000, "year", year, { starts_on: "2027-11-15", ends_on: null }, false), 6000)
  assert.equal(periodFee(6000, "year", year, { starts_on: "2020-01-01", ends_on: "2027-03-31" }, true), 1500)
})

test("member import row: contact + membership, German dates, type by name", async () => {
  const { readMember } = await import("./fields.ts")
  const types = [{ id: "t1", name: "Vollmitglied" }, { id: "t2", name: "Jugend" }]
  const row = { first_name: "Ana", email: "ana@x.de", "membership.type": "jugend", "membership.starts_on": "01.03.2019", "membership.number": "M-0042", "membership.iban": "DE02 1203 0000 0000 2020 51" }
  const r = readMember((k) => row[k] ?? "", types, [], "2027-01-01")
  assert.ok("row" in r, JSON.stringify(r))
  assert.equal(r.row.membership.type_id, "t2")
  assert.equal(r.row.membership.starts_on, "2019-03-01")
  assert.equal(r.row.membership.number, 42)
  assert.equal(r.row.membership.member_no, "M-0042")
  assert.equal(r.row.membership.mandate_signed_on, "2019-03-01")
  assert.equal(readMember((k) => ({ ...row, "membership.type": "Gold" })[k] ?? "", types, [], "2027-01-01").error, "errors.unknown_membership_type")
  const single = readMember((k) => ({ first_name: "B" })[k] ?? "", [types[0]], [], "2027-01-01")
  assert.equal(single.row.membership.type_id, "t1")
  assert.equal(single.row.membership.starts_on, "2027-01-01")
})

test("pause: no fee for periods fully inside it, pro-rata skips paused months", () => {
  const m = { starts_on: "2027-01-01", ends_on: null, paused_from: "2027-03-15", paused_until: "2027-06-30" }
  assert.ok(isPaused(m, "2027-04-01") && !isPaused(m, "2027-07-01") && isPaused({ ...m, paused_until: null }, "2030-01-01"))
  assert.ok(billable(m, { start: "2027-03-01", end: "2027-03-31" }))
  assert.ok(!billable(m, { start: "2027-04-01", end: "2027-06-30" }))
  assert.equal(periodFee(1200, "year", { start: "2027-01-01", end: "2027-12-31" }, m, true), 900)
})

test("fee-free until (DJ voucher): periods ending on or before it are free", () => {
  const m = { starts_on: "2027-01-01", ends_on: null, fee_free_until: "2027-06-30" }
  assert.ok(!billable(m, { start: "2027-04-01", end: "2027-06-30" }))
  assert.ok(billable(m, { start: "2027-07-01", end: "2027-09-30" }))
  assert.equal(periodFee(1200, "year", { start: "2027-01-01", end: "2027-12-31" }, m, true), 600)
})
