// Tickets as PDF: one A6 page per ticket with QR code. Standard fonts (WinAnsi): other characters become "?".
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import QRCode from "qrcode"

export type PdfTicket = { code: string; event: string; when: string; venue: string | null; type: string; holder: string | null; org: string }

const winAnsi = (s: string) => s.replace(/[^\x20-\x7E -ÿ€–—„“”‚‘’…•]/g, "?")

export async function ticketsPdf(tickets: PdfTicket[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  for (const k of tickets) {
    const page = doc.addPage([298, 420]) // A6 in points
    const png = await doc.embedPng(await QRCode.toBuffer(k.code, { margin: 1, width: 400, errorCorrectionLevel: "M" }))
    let y = 392
    const line = (text: string, f = font, size = 11, color = rgb(0.1, 0.1, 0.1)) => {
      for (const part of wrap(winAnsi(text), f, size, 258)) {
        page.drawText(part, { x: 20, y, size, font: f, color })
        y -= size + 5
      }
    }
    line(k.org, font, 9, rgb(0.4, 0.4, 0.4))
    y -= 2
    line(k.event, bold, 15)
    line(k.when)
    if (k.venue) line(k.venue)
    y -= 4
    line(k.holder ? `${k.type} · ${k.holder}` : k.type, bold, 11)
    const size = 170
    page.drawImage(png, { x: (298 - size) / 2, y: 60, width: size, height: size })
    page.drawText(k.code, { x: (298 - mono.widthOfTextAtSize(k.code, 16)) / 2, y: 36, size: 16, font: mono })
  }
  return doc.save()

  function wrap(text: string, f: typeof font, size: number, max: number) {
    const out: string[] = []
    let cur = ""
    for (const word of text.split(" ")) {
      const next = cur ? `${cur} ${word}` : word
      if (f.widthOfTextAtSize(next, size) > max && cur) {
        out.push(cur)
        cur = word
      } else cur = next
    }
    if (cur) out.push(cur)
    return out.slice(0, 3)
  }
}
