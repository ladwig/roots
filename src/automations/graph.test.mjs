import assert from "node:assert/strict"
import { test as it } from "node:test"
import { fill, next, passes, test, validate, waitMs } from "./graph.ts"

const n = (id, type, data = {}) => ({ id, type, position: { x: 0, y: 0 }, data })
const e = (source, target, sourceHandle) => ({ id: `${source}-${target}`, source, target, sourceHandle })
const good = {
  nodes: [
    n("t", "trigger", { event: "contact.created" }),
    n("c", "condition", { match: "all", rules: [{ field: "contact.tags", op: "contains", value: "VIP" }] }),
    n("w", "wait", { amount: 2, unit: "days" }),
    n("m", "send_email", { subject: "Hallo {first_name}", body: "<p>Hi</p>" }),
    n("x", "add_tag", { tag: "welcomed" }),
  ],
  edges: [e("t", "c"), e("c", "w", "yes"), e("c", "x", "no"), e("w", "m")],
}

it("valid graph and walking it", () => {
  assert.deepEqual(validate(good), [])
  assert.equal(next(good, "c", "yes").id, "w")
  assert.equal(next(good, "c", "no").id, "x")
  assert.equal(next(good, "m"), null)
  assert.equal(waitMs({ amount: 2, unit: "days" }), 172_800_000)
})

it("problems: trigger, branches, unreachable, cycle, incomplete", () => {
  const keys = (g) => validate(g).map((p) => p.key)
  assert.deepEqual(keys({ nodes: [n("m", "send_email", { subject: "x", body: "y" })], edges: [] }), ["noTrigger"])
  assert.ok(keys({ ...good, edges: [...good.edges, e("w", "x")] }).includes("oneNext"))
  assert.ok(keys({ ...good, edges: good.edges.filter((x) => x.target !== "x") }).includes("unreachable"))
  assert.ok(keys({ ...good, edges: [...good.edges, e("m", "c")] }).includes("cycle"))
  assert.ok(keys({ ...good, nodes: good.nodes.map((x) => (x.id === "m" ? n("m", "send_email", { subject: "", body: "" }) : x)) }).includes("incomplete"))
  assert.ok(keys({ ...good, nodes: [...good.nodes, n("h", "webhook", { url: "http://insecure" })], edges: [...good.edges, e("x", "h")] }).includes("incomplete"))
})

it("conditions and placeholders", () => {
  const ctx = { contact: { first_name: "Ana", tags: ["VIP", "Crew"], city: "Berlin", custom: { visits: 4 } }, payload: { title: "Yoga" } }
  assert.equal(test({ field: "contact.tags", op: "contains", value: "vip" }, ctx), true)
  assert.equal(test({ field: "contact.custom.visits", op: "gte", value: "4" }, ctx), true)
  assert.equal(test({ field: "contact.custom.visits", op: "gt", value: "10" }, ctx), false)
  assert.equal(test({ field: "contact.phone", op: "empty", value: "" }, ctx), true)
  assert.equal(passes({ match: "any", rules: [{ field: "contact.city", op: "eq", value: "Hamburg" }, { field: "payload.title", op: "eq", value: "yoga" }] }, ctx), true)
  assert.equal(fill("Hi {first_name}, {title} · {contact.city} {unknown}", ctx), "Hi Ana, Yoga · Berlin {unknown}")
})
