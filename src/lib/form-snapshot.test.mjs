import { test } from "node:test"
import assert from "node:assert/strict"
import { failedSubmit, fieldValues, toRestore } from "./form-snapshot.ts"

test("fieldValues groups values by name in order", () => {
  const snap = fieldValues([["tags", "a"], ["tags", "b"], ["first_name", "Erika"]])
  assert.deepEqual([...snap], [["tags", ["a", "b"]], ["first_name", ["Erika"]]])
})

test("fieldValues drops files", () => {
  const snap = fieldValues([["doc", new File(["x"], "a.txt")], ["city", "Berlin"]])
  assert.equal(snap.has("doc"), false)
  assert.deepEqual(snap.get("city"), ["Berlin"])
})

test("failedSubmit is true only when the query string has an error", () => {
  assert.equal(failedSubmit("?new=contacts&error=Name%20fehlt"), true)
  assert.equal(failedSubmit("?ok=Gespeichert"), false)
  assert.equal(failedSubmit(""), false)
})

const sent = { path: "/contacts/new", form: 0, at: 1_000, values: [["city", ["Teststadt"]]] }
const here = { path: "/contacts/new", form: 0, search: "error=Name%20fehlt", now: 5_000 }

test("toRestore returns the sent values after a failed submit on the same form", () => {
  assert.deepEqual([...toRestore(sent, here)], [["city", ["Teststadt"]]])
})

test("toRestore ignores a successful save", () => {
  assert.equal(toRestore(sent, { ...here, search: "ok=Gespeichert" }), null)
})

test("toRestore ignores another page, another form and old snapshots", () => {
  assert.equal(toRestore(sent, { ...here, path: "/contacts/abc" }), null)
  assert.equal(toRestore(sent, { ...here, form: 1 }), null)
  assert.equal(toRestore(sent, { ...here, now: 1_000 + 30_001 }), null)
  assert.equal(toRestore(null, here), null)
})
