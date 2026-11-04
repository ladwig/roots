import { test } from "node:test"
import assert from "node:assert/strict"
import { failedSubmit, fieldValues, keepSent, restoreFields, toRestore } from "./form-snapshot.ts"

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

test("keepSent keeps a failed submit only for another form on the same page", () => {
  assert.equal(keepSent(sent, { ...here, form: 1 }), true)
  assert.equal(keepSent(sent, here), false) // this form took it
  assert.equal(keepSent(sent, { ...here, form: 1, search: "ok=Gespeichert" }), false) // saved: nothing to restore
  assert.equal(keepSent(sent, { ...here, form: 1, path: "/contacts" }), false)
  assert.equal(keepSent(sent, { ...here, form: 1, now: 1_000 + 30_001 }), false)
  assert.equal(keepSent(null, here), false)
})

test("restoreFields puts sent values back and leaves hidden, file, password and disabled fields alone", () => {
  const box = (value, checked) => ({ name: "roles", type: "checkbox", disabled: false, value, checked })
  const opt = (value) => ({ value, selected: false })
  const fields = [
    { name: "city", type: "text", disabled: false, value: "" },
    { name: "phone", type: "tel", disabled: false, value: "" },
    { name: "phone", type: "tel", disabled: false, value: "" },
    box("board", false),
    box("treasurer", true), // was unticked before sending: must end up unticked
    { name: "newsletter", type: "checkbox", disabled: false, value: "1", checked: true }, // not sent at all
    { name: "days", type: "select-multiple", disabled: false, value: "", options: [opt("mo"), opt("di"), opt("mi")] },
    { name: "tags", type: "hidden", disabled: false, value: "server" },
    { name: "doc", type: "file", disabled: false, value: "" },
    { name: "code", type: "text", disabled: true, value: "locked" },
  ]
  const snap = new Map([
    ["city", ["Teststadt"]], ["phone", ["030 1", "030 2"]], ["roles", ["board"]],
    ["days", ["mo", "mi"]], ["tags", ["typed"]], ["code", ["changed"]],
  ])
  restoreFields(fields, snap)
  assert.deepEqual(fields.map((f) => f.value).slice(0, 3), ["Teststadt", "030 1", "030 2"])
  assert.deepEqual([fields[3].checked, fields[4].checked, fields[5].checked], [true, false, false])
  assert.deepEqual(fields[6].options.map((o) => o.selected), [true, false, true])
  assert.equal(fields[7].value, "server")
  assert.equal(fields[9].value, "locked")
})
