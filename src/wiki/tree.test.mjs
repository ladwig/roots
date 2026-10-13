import assert from "node:assert/strict"
import { test } from "node:test"
import { buildTree, pathTo, subtree } from "./tree.ts"

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
