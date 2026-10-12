import { test } from "node:test"
import assert from "node:assert/strict"
import { fieldKey, fieldVars, fillHtml, fillText, readFields } from "./model.ts"
import { htmlBlocks } from "../documents/rich.ts"

test("readFields keeps valid, unique fields that don't shadow built-ins", () => {
  const fields = readFields([
    { key: "event", label: "Veranstaltung", type: "text" },
    { key: "event", label: "dup", type: "text" },
    { key: "name", label: "shadows a placeholder", type: "text" },
    { key: "Bad Key", label: "x" },
    { key: "when", label: "Datum", type: "nope" },
    { key: "ok", label: "" },
  ])
  assert.deepEqual(fields, [
    { key: "event", label: "Veranstaltung", type: "text" },
    { key: "when", label: "Datum", type: "text" },
  ])
  assert.deepEqual(readFields("nope"), [])
})

test("fieldKey makes a key from a German label", () => {
  assert.equal(fieldKey("Datum der Veranstaltung"), "datum_der_veranstaltung")
  assert.equal(fieldKey("Größe (cm)"), "groesse_cm")
  assert.equal(fieldKey("123"), "feld")
})

test("filling escapes values, keeps line breaks, blanks unknown keys", () => {
  const vars = { name: "Ada <b>", text: "Zeile 1\nZeile 2", ...fieldVars([{ key: "d", label: "D", type: "date" }], { d: "2026-10-12" }, (iso) => `[${iso}]`) }
  assert.equal(fillHtml("<p>Hallo {name}, {text} {d} {missing}</p>", vars), "<p>Hallo Ada &#60;b&#62;, Zeile 1<br>Zeile 2 [2026-10-12] </p>")
  assert.equal(fillText("  {subject}  für {name} ", { name: "Ada" }), "für Ada")
  assert.equal(fillHtml('<p onclick="x()">a</p><script>alert(1)</script>', {}), "<p>a</p>")
})

test("htmlBlocks turns editor HTML into styled blocks", () => {
  const blocks = htmlBlocks("<h2>Titel</h2><p>Hallo <strong>fett</strong> und <em>schräg</em>&amp;mehr<br>neu</p><ul><li><p>eins</p></li><li>zwei</li></ul><ol><li>a</li></ol><hr><blockquote><p>Zitat</p></blockquote>")
  assert.deepEqual(
    blocks.map((b) => [b.kind, b.marker ?? "", b.runs.map((r) => (r.bold ? `*${r.text}*` : r.italic ? `_${r.text}_` : r.text)).join("")]),
    [
      ["h2", "", "Titel"],
      ["p", "", "Hallo *fett* und _schräg_&mehr\nneu"],
      ["li", "•", "eins"],
      ["li", "•", "zwei"],
      ["li", "1.", "a"],
      ["hr", "", ""],
      ["quote", "", "Zitat"],
    ],
  )
  assert.deepEqual(htmlBlocks("plain text"), [{ kind: "p", runs: [{ text: "plain text" }] }])
})
