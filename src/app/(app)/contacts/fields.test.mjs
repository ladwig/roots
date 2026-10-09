import { test } from "node:test"
import assert from "node:assert/strict"
import { contactName, parseTags, readContact } from "./fields.ts"

const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

test("parseTags", () => {
  assert.deepEqual(parseTags(" VIP, Mitglied ,vip,, "), ["VIP", "Mitglied"])
  assert.deepEqual(parseTags(""), [])
  assert.equal(parseTags("x".repeat(60))[0].length, 40)
})

test("readContact", () => {
  assert.deepEqual(readContact(fd({ phone: "1" })), { error: "errors.contact_needs_name" })
  assert.deepEqual(readContact(fd({ email: "nope" })), { error: "errors.invalid_email" })
  assert.deepEqual(readContact(fd({ email: "a@b.de", country: "XX" })), { error: "errors.invalid_input" })
  const r = readContact(fd({ first_name: " Max ", email: "Max@X.de", tags: "a, b" }))
  assert.equal(r.row.first_name, "Max")
  assert.equal(r.row.email, "max@x.de")
  assert.deepEqual(r.row.tags, ["a", "b"])
  assert.equal(r.row.city, null)
})

test("contactName", () => {
  assert.equal(contactName({ first_name: "Max", last_name: null, company: "ACME", email: null }), "Max")
  assert.equal(contactName({ first_name: null, last_name: null, company: null, email: "a@b.de" }), "a@b.de")
})
