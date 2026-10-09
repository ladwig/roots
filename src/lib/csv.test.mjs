import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeCsv, guessMapping, parseCsv } from "./csv.ts"
import { fieldKey, parseValue, readCustom } from "./custom-fields.ts"

test("parseCsv: German Excel (;), quotes, newlines in quotes, CRLF, blank lines", () => {
  const rows = parseCsv('Vorname;Nachname;Notiz\r\nMax;"Muster; Mann";"Zeile 1\nZeile ""2"""\r\n\r\nErika;;\r\n')
  assert.deepEqual(rows, [["Vorname", "Nachname", "Notiz"], ["Max", "Muster; Mann", 'Zeile 1\nZeile "2"'], ["Erika", "", ""]])
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]])
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]])
})

test("decodeCsv: UTF-8 with BOM and Windows-1252", () => {
  assert.equal(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, 0x4b, 0xc3, 0xb6, 0x6c, 0x6e])), "Köln")
  assert.equal(decodeCsv(new Uint8Array([0x4b, 0xf6, 0x6c, 0x6e])), "Köln")
})

test("guessMapping", () => {
  const fields = [
    { key: "first_name", label: "Vorname", aliases: ["first name"] },
    { key: "email", label: "E-Mail", aliases: ["mail", "email address"] },
    { key: "postal_code", label: "PLZ" },
  ]
  assert.deepEqual(guessMapping(["Vorname", "E-Mail-Adresse", "plz", "Email", "Foo"], fields), ["first_name", null, "postal_code", "email", null])
  assert.deepEqual(guessMapping(["First Name", "mail", "mail"], fields), ["first_name", "email", null])
})

test("custom field values", () => {
  const def = (type, options = []) => ({ key: "k", label: "K", type, options, required: false })
  assert.deepEqual(parseValue(def("number"), "1.234,5"), { value: 1234.5 })
  assert.deepEqual(parseValue(def("number"), "12.5"), { value: 12.5 })
  assert.deepEqual(parseValue(def("number"), "abc"), { error: "errors.invalid_number" })
  assert.deepEqual(parseValue(def("date"), "3.2.2024"), { value: "2024-02-03" })
  assert.deepEqual(parseValue(def("date"), "2024-02-30"), { error: "errors.invalid_date" })
  assert.deepEqual(parseValue(def("boolean"), "Ja"), { value: true })
  assert.deepEqual(parseValue(def("boolean"), ""), {})
  assert.deepEqual(parseValue(def("select", ["Gold", "Silber"]), "gold"), { value: "Gold" })
  assert.deepEqual(parseValue(def("select", ["Gold"]), "Bronze"), { error: "errors.invalid_option" })
  assert.deepEqual(parseValue(def("text"), "  "), {})
  const defs = [{ key: "nr", label: "Nr.", type: "text", options: [], required: true }]
  assert.deepEqual(readCustom(defs, () => ""), { error: "errors.field_required", field: "Nr." })
  assert.deepEqual(readCustom(defs, () => "7"), { custom: { nr: "7" } })
  assert.equal(fieldKey("Mitglieds-Nr. (alt)"), "mitglieds_nr_alt")
  assert.equal(fieldKey("1. Größe"), "groesse")
})
