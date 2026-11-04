import { test } from "node:test"
import assert from "node:assert/strict"
import { pdfText } from "./pdf.ts"

test("pdf text: Windows line breaks, tabs and undrawable characters never reach the font", () => {
  assert.equal(pdfText("Danke\r\nfür\rdeinen\tKauf – 12 € ✓"), "Danke\nfür\ndeinen Kauf – 12 € ")
})
