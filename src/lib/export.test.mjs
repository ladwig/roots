import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { toCsv, toXlsx } from "./export.ts"

const table = { headers: ["Name", "Betrag"], rows: [["Müller; \"Max\"", 12.5], ["Ana", null]] }

test("csv: BOM, semicolons, quoting", () => {
  assert.equal(toCsv(table), '﻿Name;Betrag\r\n"Müller; ""Max""";12.5\r\nAna;\r\n')
})

test("xlsx is a valid zip with the sheet inside", () => {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"))
  const file = join(dir, "t.xlsx")
  writeFileSync(file, toXlsx(table))
  const list = execFileSync("unzip", ["-l", file]).toString()
  assert.match(list, /xl\/worksheets\/sheet1\.xml/)
  const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"]).toString()
  assert.match(sheet, /Müller; &quot;Max&quot;/)
  assert.match(sheet, /<v>12.5<\/v>/)
})
