import assert from "node:assert/strict"
import { test } from "node:test"
import { readSubmission, template } from "./elements.ts"

const els = template("membership", { privacy: "Datenschutz", statutes: "Satzung" })
const ctx = { purpose: "membership", customDefs: [], typeIds: ["t1"], today: "2027-01-01" }
const base = {
  first_name: "Ana", last_name: "Muster", email: "Ana@X.de", street: "Weg 1", postal_code: "12345", city: "Köln",
  "membership.type": "t1", iban: "de02 1203 0000 0000 2020 51", mandate_ok: "on",
  ...Object.fromEntries(els.filter((e) => e.kind === "consent").map((e) => [`consent.${e.id}`, "on"])),
}
const read = (v) => readSubmission(els, (k) => v[k] ?? "", ctx)

test("membership application reads contact, type and mandate", () => {
  const r = read(base)
  assert.ok("data" in r, JSON.stringify(r))
  assert.equal(r.data.contact.email, "ana@x.de")
  assert.equal(r.data.membership.iban, "DE02120300000000202051")
  assert.equal(r.data.consents.length, 2)
})

test("required fields, consents, mandate and type are enforced", () => {
  assert.equal(read({ ...base, city: "" }).error, "errors.field_required")
  assert.equal(read({ ...base, "membership.type": "other" }).error, "errors.invalid_option")
  assert.equal(read({ ...base, mandate_ok: "" }).error, "errors.mandate_required")
  assert.equal(read({ ...base, iban: "123" }).error, "errors.invalid_iban")
  const consent = els.find((e) => e.kind === "consent")
  assert.equal(read({ ...base, [`consent.${consent.id}`]: "" }).error, "errors.consent_required")
})

test("fields not on the form are ignored", () => {
  const form = template("contact", { privacy: "P", statutes: "S" })
  const consent = form.find((e) => e.kind === "consent")
  const r = readSubmission(form, (k) => ({ first_name: "A", email: "a@b.de", company: "not on the form", [`consent.${consent.id}`]: "on" })[k] ?? "", { ...ctx, purpose: "contact" })
  assert.ok("data" in r)
  assert.equal(r.data.contact.company, null)
  assert.equal(r.data.membership, undefined)
})
