import assert from "node:assert/strict"
import { test } from "node:test"
import { progress, readChecklist, readTask } from "./fields.ts"

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
