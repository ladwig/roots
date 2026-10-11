import { test } from "node:test"
import assert from "node:assert/strict"
import { PDFDocument } from "pdf-lib"
import { ticketsPdf } from "./pdf.ts"

test("ticket pdf: one page per ticket, umlauts ok, emoji replaced", async () => {
  const k = { code: "ABCDEFGH23", event: "Sommerfest Übermorgen 🎉", when: "Fr., 1. Aug. 2030, 21:00", venue: "Vereinsheim Köln", type: "Normal", holder: "Jürgen", org: "Kulturverein" }
  const pdf = await ticketsPdf([k, { ...k, code: "ZZZZZZZZZ2", holder: null }])
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-")
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 2)
})
