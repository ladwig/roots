import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { test } from "node:test"
import { NOT_OBJECTS, OBJECTS, objectsFor, parseRecordTrigger, pickFields, recordTrigger } from "./objects.ts"

// New features adapt: every audited table is either a workflow object or deliberately listed in NOT_OBJECTS.
test("every audited table is a workflow object or listed as not one", () => {
  const dir = new URL("../../supabase/migrations/", import.meta.url)
  const audited = new Set(readdirSync(dir).flatMap((f) => [...readFileSync(new URL(f, dir), "utf8").matchAll(/enable_audit\('public\.([a-z_]+)'\)/g)].map((m) => m[1])))
  const known = new Set([...Object.values(OBJECTS).map((o) => o.table), ...NOT_OBJECTS])
  assert.deepEqual([...audited].filter((t) => !known.has(t)).sort(), [], "add these tables to OBJECTS (src/automations/objects.ts) or NOT_OBJECTS")
  for (const [k, o] of Object.entries(OBJECTS)) for (const target of Object.values(o.relations ?? {})) assert.ok(target in OBJECTS, `${k} relates to unknown ${target}`)
})

test("record triggers and the objects they bring", () => {
  assert.equal(recordTrigger("ticket", "insert"), "record:tickets:insert")
  assert.deepEqual(parseRecordTrigger("record:tickets:insert"), { object: "ticket", action: "insert" })
  assert.equal(parseRecordTrigger("record:api_keys:insert"), null)
  assert.deepEqual(objectsFor("record:tickets:insert"), ["ticket", "event", "order", "contact", "ticket_type", "membership", "now"])
  assert.deepEqual(objectsFor("record:tickets:insert", new Set(["tickets", "events"])), ["ticket", "event", "ticket_type", "now"])
  assert.deepEqual(pickFields("membership", { id: "m", iban: "DE…", ends_on: null, contact_id: "c", type_id: "t" }), { id: "m", ends_on: null, type_id: "t", contact_id: "c" })
})

test("schedules and creatable objects", async () => {
  const { creatableFor } = await import("./objects.ts")
  assert.deepEqual(objectsFor("schedule"), ["now"])
  assert.deepEqual(objectsFor("schedule:membership"), ["membership", "contact", "membership_type", "now"])
  assert.ok(!creatableFor("schedule").includes("note") && creatableFor("schedule").includes("event")) // no person in the run: nothing linked to one
  assert.ok(creatableFor("contact.created").includes("membership"))
})

test("form answers: flat person fields, custom, membership without bank details, accepted consents", async () => {
  const { pickFields } = await import("./objects.ts")
  const row = { id: "s", status: "new", data: { contact: { first_name: "Ana" }, custom: { level: "pro" }, membership: { type_id: "t", starts_on: null, iban: "DE02120300000000202051", bic: "X" }, consents: [{ label: "AGB", accepted: true }, { label: "News", accepted: false }] } }
  assert.deepEqual(pickFields("submission", row).answers, { first_name: "Ana", custom: { level: "pro" }, membership: { type_id: "t", starts_on: null, iban: "DE02…2051" }, consents: ["AGB"] })
})
