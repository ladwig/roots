import { test } from "node:test"
import assert from "node:assert/strict"
import { contactName, parseTags, readContact } from "./fields.ts"

const get = (o) => (k) => o[k] ?? ""
const defs = [{ key: "level", label: "Level", type: "select", options: ["Gold", "Silber"], required: false }]

test("parseTags", () => {
  assert.deepEqual(parseTags(" VIP, Mitglied ,vip,, "), ["VIP", "Mitglied"])
  assert.deepEqual(parseTags("a;b|c"), ["a", "b", "c"])
  assert.deepEqual(parseTags(""), [])
  assert.equal(parseTags("x".repeat(60))[0].length, 40)
})

test("readContact", () => {
  assert.deepEqual(readContact(get({ phone: "1" }), []), { error: "errors.contact_needs_name" })
  assert.deepEqual(readContact(get({ email: "nope" }), []), { error: "errors.invalid_email" })
  assert.deepEqual(readContact(get({ email: "a@b.de", country: "Atlantis" }), []), { error: "errors.invalid_country" })
  assert.deepEqual(readContact(get({ email: "a@b.de", "custom.level": "Bronze" }), defs), { error: "errors.invalid_option", field: "Level" })
  const r = readContact(get({ first_name: " Max ", email: "Max@X.de", tags: "a, b", country: "Deutschland", birthday: "1.2.1990", "custom.level": "gold" }), defs)
  assert.equal(r.row.first_name, "Max")
  assert.equal(r.row.email, "max@x.de")
  assert.equal(r.row.country, "DE")
  assert.equal(r.row.birthday, "1990-02-01")
  assert.deepEqual(r.row.tags, ["a", "b"])
  assert.deepEqual(r.row.custom, { level: "Gold" })
  assert.equal(r.row.city, null)
  assert.equal(readContact(get({ email: "a@b.de", country: "germany" }), []).row.country, "DE")
})

test("contactName", () => {
  assert.equal(contactName({ first_name: "Max", last_name: null, company: "ACME", email: null }), "Max")
  assert.equal(contactName({ first_name: null, last_name: null, company: null, email: "a@b.de" }), "a@b.de")
})
