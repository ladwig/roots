import assert from "node:assert/strict"
import { test } from "node:test"
import { previewNumber, validRangeFormat } from "./number-ranges.ts"

test("number range formats: same result as the database's format_document_number()", () => {
  assert.equal(previewNumber("#{MM}{YYYY}-{BY}-{N}", 344, "2026-10-13", "1976-05-01"), "#102026-76-344")
  assert.equal(previewNumber("TA{NNNN}", 7, "2026-10-13"), "TA0007")
  assert.equal(previewNumber("M-{RAND6}", 1, "2026-10-13"), "M-XXXXXX")
  assert.ok(validRangeFormat("RE-{YYYY}-{NNNN}") && validRangeFormat("{RAND8}") && validRangeFormat("#{MM}{YYYY}-{BY}-{N}"))
  assert.ok(!validRangeFormat("RE-{YYYY}") && !validRangeFormat("{N} x") && !validRangeFormat("{N}<script>"))
})
