import assert from "node:assert/strict"
import { test } from "node:test"
import { absenceDays, grossPay, vacationTaken } from "./pay.ts"

test("absence days count Mon–Fri, clipped to a range; half days", () => {
  const week = { kind: "vacation", starts_on: "2026-10-12", ends_on: "2026-10-18", half_day: false } // Mon–Sun
  assert.equal(absenceDays(week), 5)
  assert.equal(absenceDays(week, "2026-10-14", "2026-10-31"), 3)
  assert.equal(absenceDays({ kind: "vacation", starts_on: "2026-10-13", ends_on: "2026-10-13", half_day: true }), 0.5)
  assert.equal(vacationTaken([week, { ...week, kind: "sick" }, { kind: "vacation", starts_on: "2026-12-31", ends_on: "2027-01-01", half_day: false }], 2026), 6)
})

test("gross pay and warnings", () => {
  const mini = { employment_type: "minijob", pay_type: "hourly", hourly_rate_cents: 1400, monthly_salary_cents: null }
  assert.deepEqual(grossPay(mini, 40 * 60, 2026), { gross: 56_000, warnings: [] })
  assert.deepEqual(grossPay(mini, 50 * 60, 2026), { gross: 70_000, warnings: ["minijob_over"] })
  assert.deepEqual(grossPay({ ...mini, hourly_rate_cents: 1200 }, 60, 2026).warnings, ["below_min_wage"])
  assert.deepEqual(grossPay({ ...mini, hourly_rate_cents: null }, 60, 2026), { gross: null, warnings: ["no_rate"] })
  assert.equal(grossPay({ employment_type: "full_time", pay_type: "monthly", hourly_rate_cents: null, monthly_salary_cents: 300_000 }, 0, 2026).gross, 300_000)
  assert.deepEqual(grossPay({ ...mini, employment_type: "volunteer", hourly_rate_cents: 0 }, 600, 2026).warnings, [])
})

test("field parsing", async () => {
  const { readEmployee, readPrivate, readAbsence } = await import("./fields.ts")
  const get = (o) => (k) => o[k] ?? ""
  const e = readEmployee(get({ name: " Anna ", employment_type: "minijob", hourly_rate: "14,50", weekly_hours: "10,5" }))
  assert.equal(e.row.name, "Anna")
  assert.equal(e.row.hourly_rate_cents, 1450)
  assert.equal(e.row.weekly_hours, 10.5)
  assert.equal(readEmployee(get({ name: "x", starts_on: "2026-02-01", ends_on: "2026-01-01" })).error, "hr.endBeforeStart")
  assert.equal(readEmployee(get({ name: "x", hourly_rate: "abc" })).error, "hr.amountInvalid")
  assert.equal(readPrivate(get({ iban: "de02 1203 0000 0000 2020 51", tax_id: "12 345 678 901" })).row.iban, "DE02120300000000202051")
  assert.equal(readPrivate(get({ tax_id: "123" })).error, "hr.taxIdInvalid")
  assert.deepEqual(readAbsence(get({ kind: "sick", starts_on: "2026-10-13" })).row, { kind: "sick", starts_on: "2026-10-13", ends_on: "2026-10-13", half_day: false, note: null })
  assert.equal(readAbsence(get({ kind: "vacation", starts_on: "2026-10-13", ends_on: "2026-10-14", half_day: "1" })).error, "hr.halfDayOneDay")
})
