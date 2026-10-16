import assert from "node:assert/strict"
import { test } from "node:test"
import { progress, readChecklist, readProject, readTask } from "./fields.ts"

test("projects: task input and checklist", () => {
  assert.deepEqual(readTask({ title: "  Flyer  ", tags: ["Sommerfest", " Sommerfest ", ""] }), { row: { title: "Flyer", tags: ["Sommerfest"] } })
  assert.deepEqual(readTask({ title: " " }), { error: "projects.titleRequired" })
  assert.deepEqual(readTask({ due_on: "13.10.2026" }), { error: "errors.invalid_date" })
  const list = readChecklist([{ id: "a", text: " Druckerei anrufen ", done: true }, { id: "b", text: "" }, { text: "Abholen" }])
  assert.equal(list.length, 2)
  assert.equal(list[0].text, "Druckerei anrufen")
  assert.equal(progress(list), "1/2")
  assert.equal(progress([]), null)
})

test("projects: project input and dates", () => {
  assert.deepEqual(readProject({ name: " Sommerfest ", color: "neon", start_on: "2026-06-01", end_on: "" }), { row: { name: "Sommerfest", color: "blue", start_on: "2026-06-01", end_on: null } })
  assert.deepEqual(readProject({ name: "" }), { error: "projects.nameRequired" })
  assert.deepEqual(readProject({ start_on: "2026-06-02", end_on: "2026-06-01" }), { error: "projects.endBeforeStart" })
  assert.deepEqual(readTask({ start_on: "2026-06-05", due_on: "2026-06-01" }), { error: "projects.dueBeforeStart" })
  assert.deepEqual(readTask({ start_on: "", due_on: "2026-06-01" }), { row: { start_on: null, due_on: "2026-06-01" } })
})
