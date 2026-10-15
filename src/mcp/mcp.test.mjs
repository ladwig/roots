import assert from "node:assert/strict"
import { test } from "node:test"
import { appPath, callArgs, canonical, confirmMessage, opName, riskOf, uniqueNames } from "./names.ts"

test("mcp: operation names, risk, confirm payload", () => {
  assert.equal(opName("GET", "/events"), "events_list")
  assert.equal(opName("GET", "/events/{id}"), "events_get")
  assert.equal(opName("POST", "/events"), "events_create")
  assert.equal(opName("PATCH", "/events/{id}"), "events_update")
  assert.equal(opName("DELETE", "/events/{id}"), "events_delete")
  assert.equal(opName("POST", "/events/{id}/restore"), "events_restore")
  assert.equal(opName("GET", "/workflows/{id}/runs"), "workflows_runs_list")
  assert.equal(opName("PUT", "/rentals/{id}/people"), "rentals_people_set")
  assert.equal(opName("GET", "/rental-objects"), "rental_objects_list")
  assert.deepEqual(uniqueNames(["a", "b", "a"]), ["a", "b", "a_2"])

  assert.equal(riskOf("GET", "/contacts"), "read")
  assert.equal(riskOf("POST", "/contacts"), "write")
  assert.equal(riskOf("DELETE", "/contacts/{id}"), "danger")
  assert.equal(riskOf("POST", "/email/campaigns/{id}/send"), "danger")
  assert.equal(riskOf("POST", "/payments/orders/{id}/refund"), "danger")
  assert.equal(riskOf("POST", "/workflows/validate"), "read")

  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}')
  assert.equal(confirmMessage("k", "x_delete", { id: 1 }, 7), 'k|x_delete|{"id":1}|7')

  assert.equal(appPath("/events", { id: "e1", title: "x" }), "/events/e1")
  assert.equal(appPath("/rentals/{id}/notice", { id: "r1" }, { id: "r1" }), "/rentals/r/r1")
  assert.equal(appPath("/events/{id}/ticket-types", { id: "t1", event_id: "e1" }, { id: "e1" }), null) // nested: the event's page would need its id
  assert.equal(appPath("/ticket-types/{id}", { id: "t1", event_id: "e1" }), "/events/e1/tickets")
  assert.equal(appPath("/contacts", { data: [] }), null)
  assert.deepEqual(callArgs({ operation: "x", params: { a: 1 } }), { a: 1 })
  assert.deepEqual(callArgs({ operation: "x", a: 1, confirm_token: "t" }), { a: 1 })
})
