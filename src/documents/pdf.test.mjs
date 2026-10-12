import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { test } from "node:test"
import { pdfText, renderPdf } from "./pdf.ts"

const view = {
  kind: "invoice", draft: true, stamp: "Entwurf", title: "Rechnung", logoUrl: null,
  seller: { legal_name: "Kulturverein Süd e.V." },
  senderLine: "Kulturverein Süd e.V. · Weg 1 · 50667 Köln",
  recipient: ["Erika Muster", "Hauptstraße 5", "12345 Berlin"],
  meta: [{ label: "Rechnungsnr.", value: "RE-2027-0001" }, { label: "Datum", value: "12.10.2027" }],
  intro: "Vielen Dank für Ihren Auftrag.", outro: "Mit freundlichen Grüßen",
  items: Array.from({ length: 40 }, (_, i) => ({ pos: i + 1, title: `Leistung ${i + 1} – Bühnentechnik`, description: i % 3 ? null : "Aufbau, Abbau und Betreuung während der Veranstaltung", quantity: "2", unit: "Std.", unitPrice: "50,00 €", taxRate: "19 %", total: "100,00 €" })),
  totals: [{ label: "Netto", value: "4.000,00 €" }, { label: "USt 19 %", value: "760,00 €" }, { label: "Gesamt", value: "4.760,00 €", strong: true }],
  notes: ["Zahlbar bis 26.10.2027."],
  footer: [["Kulturverein Süd e.V.", "Weg 1"], ["info@x.de"], ["St.-Nr. 12/345"], ["IBAN DE02 1203 0000 0000 2020 51"]],
  labels: { pos: "Pos.", description: "Beschreibung", quantity: "Menge", unitPrice: "Einzelpreis", tax: "USt", total: "Gesamt", page: "Seite" },
}

test("renders a multi-page invoice PDF", async () => {
  const bytes = await renderPdf(view)
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-")
  const { PDFDocument } = await import("pdf-lib")
  const doc = await PDFDocument.load(bytes)
  assert.ok(doc.getPageCount() >= 2, `pages: ${doc.getPageCount()}`)
  if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes)
})

test("text is made safe for Helvetica", () => {
  assert.equal(pdfText("12,50 € – ok 🎉"), "12,50 € – ok ")
})
