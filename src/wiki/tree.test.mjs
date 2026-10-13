import assert from "node:assert/strict"
import { test } from "node:test"
import { buildTree, effectiveVisibility, pathTo, subtree } from "./tree.ts"

test("wiki tree", () => {
  const rows = [
    { id: "a", parent_id: null, title: "Handbuch", position: 0 },
    { id: "b", parent_id: "a", title: "Kasse", position: 1 },
    { id: "c", parent_id: "a", title: "Bar", position: 0 },
    { id: "d", parent_id: "b", title: "Abschluss", position: 0 },
    { id: "e", parent_id: "gone", title: "Waise", position: 0 },
  ]
  const tree = buildTree(rows)
  assert.deepEqual(tree.map((n) => n.id), ["a", "e"])
  assert.deepEqual(tree[0].children.map((n) => n.id), ["c", "b"])
  assert.deepEqual(pathTo(rows, "d").map((r) => r.id), ["a", "b"])
  assert.deepEqual([...subtree(rows, "b")].sort(), ["b", "d"])
})

test("wiki visibility is inherited from the nearest page with a setting", () => {
  const rows = [
    { id: "a", parent_id: null, title: "Vorstand", position: 0, visibility: "roles" },
    { id: "b", parent_id: "a", title: "Protokolle", position: 0 },
    { id: "c", parent_id: "b", title: "Offen", position: 0, visibility: "team" },
    { id: "d", parent_id: null, title: "FAQ", position: 1 },
  ]
  assert.deepEqual(effectiveVisibility(rows, "b"), { visibility: "roles", from: "a" })
  assert.deepEqual(effectiveVisibility(rows, "c"), { visibility: "team", from: "c" })
  assert.deepEqual(effectiveVisibility(rows, "d"), { visibility: "team", from: null })
})
