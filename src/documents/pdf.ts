// Server PDF renderer for the DocView model (DIN 5008 form B, A4). Same content as the print templates, drawn with
// pdf-lib: no headless browser, no fonts to ship (Helvetica, WinAnsi covers German incl. € and §).
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import type { DocView } from "./model"

const mm = (v: number) => (v * 72) / 25.4
const W = mm(210)
const H = mm(297)
const LEFT = mm(25)
const RIGHT = W - mm(20)
const BOTTOM = mm(32) // above the footer
const ink = rgb(0.1, 0.1, 0.1)
const muted = rgb(0.42, 0.42, 0.42)
const line = rgb(0.8, 0.8, 0.8)

// Helvetica (WinAnsi) can't draw every character: normalise spaces/dashes, drop what's left.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"
export const pdfText = (s: string) =>
  s
    .replace(/[   ]/g, " ")
    .replace(/[‐-‒]/g, "-")
    .split("")
    .filter((c) => c.charCodeAt(0) < 256 || WIN_ANSI_EXTRA.includes(c))
    .join("")

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = []
  for (const para of pdfText(text).split("\n")) {
    let cur = ""
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next
      else {
        out.push(cur)
        cur = word
      }
    }
    out.push(cur)
  }
  return out
}

export async function renderPdf(view: DocView, logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(pdfText(`${view.title} ${view.meta[0]?.value ?? ""}`.trim()))
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const image = logo ? await (logo.type === "png" ? pdf.embedPng(logo.bytes) : pdf.embedJpg(logo.bytes)).catch(() => null) : null
  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0

  const text = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: typeof ink; align?: "right" } = {}) => {
    const size = o.size ?? 9.5
    const font = o.font ?? regular
    const str = pdfText(s)
    const dx = o.align === "right" ? font.widthOfTextAtSize(str, size) : 0
    page.drawText(str, { x: x - dx, y: yy, size, font, color: o.color ?? ink })
  }
  const newPage = (first: boolean) => {
    page = pdf.addPage([W, H])
    pages.push(page)
    y = first ? H - mm(103.4) : H - mm(20)
  }
  const need = (h: number) => {
    if (y - h < BOTTOM) newPage(false)
  }

  // ---- first page: letterhead, address window, info block ----
  newPage(true)
  if (image) {
    const s = Math.min(mm(45) / image.width, mm(20) / image.height)
    page.drawImage(image, { x: RIGHT - image.width * s, y: H - mm(12) - image.height * s, width: image.width * s, height: image.height * s })
  }
  text(view.seller.legal_name ?? "", LEFT, H - mm(20), { size: 13, font: bold })
  // DIN 5008 form B: window at 45 mm from top, sender line above the recipient.
  text(view.senderLine, LEFT, H - mm(50), { size: 7, color: muted })
  view.recipient.slice(0, 6).forEach((l, i) => text(l, LEFT, H - mm(58) - i * 12.5, { size: 10 }))
  const infoX = mm(125)
  view.meta.forEach((m, i) => {
    text(m.label, infoX, H - mm(50) - i * 13, { size: 8.5, color: muted })
    text(m.value, RIGHT, H - mm(50) - i * 13, { size: 8.5, align: "right" })
  })
  text(view.title, LEFT, y, { size: 15, font: bold })
  y -= 26
  if (view.intro) {
    for (const l of wrap(view.intro, regular, 9.5, RIGHT - LEFT)) {
      need(13)
      text(l, LEFT, y)
      y -= 13
    }
    y -= 8
  }

  // ---- items ----
  const cols = { pos: LEFT, desc: LEFT + 24, qty: RIGHT - 190, price: RIGHT - 110, tax: RIGHT - 62, total: RIGHT }
  const descWidth = cols.qty - 56 - cols.desc
  const header = () => {
    need(30)
    text(view.labels.pos, cols.pos, y, { size: 8, color: muted })
    text(view.labels.description, cols.desc, y, { size: 8, color: muted })
    text(view.labels.quantity, cols.qty, y, { size: 8, color: muted, align: "right" })
    text(view.labels.unitPrice, cols.price, y, { size: 8, color: muted, align: "right" })
    if (view.items.some((i) => i.taxRate)) text(view.labels.tax, cols.tax, y, { size: 8, color: muted, align: "right" })
    text(view.labels.total, cols.total, y, { size: 8, color: muted, align: "right" })
    page.drawLine({ start: { x: LEFT, y: y - 5 }, end: { x: RIGHT, y: y - 5 }, thickness: 0.6, color: line })
    y -= 18
  }
  header()
  for (const item of view.items) {
    const title = wrap(item.title, bold, 9.5, descWidth)
    const desc = item.description ? wrap(item.description, regular, 8.5, descWidth) : []
    const h = title.length * 12 + desc.length * 11 + 8
    if (y - h < BOTTOM) {
      newPage(false)
      header()
    }
    text(String(item.pos), cols.pos, y)
    text(`${item.quantity} ${item.unit}`, cols.qty, y, { align: "right" })
    text(item.unitPrice, cols.price, y, { align: "right" })
    if (item.taxRate) text(item.taxRate, cols.tax, y, { align: "right" })
    text(item.total, cols.total, y, { align: "right" })
    title.forEach((l) => {
      text(l, cols.desc, y, { font: bold })
      y -= 12
    })
    desc.forEach((l) => {
      text(l, cols.desc, y, { size: 8.5, color: muted })
      y -= 11
    })
    y -= 8
  }

  // ---- totals, notes, outro ----
  need(view.totals.length * 15 + 12)
  page.drawLine({ start: { x: RIGHT - 200, y: y + 4 }, end: { x: RIGHT, y: y + 4 }, thickness: 0.6, color: line })
  y -= 10
  for (const tot of view.totals) {
    const font = tot.strong ? bold : regular
    text(tot.label, RIGHT - 200, y, { font })
    text(tot.value, RIGHT, y, { font, align: "right" })
    y -= 15
  }
  y -= 10
  for (const block of [...view.notes, ...(view.outro ? [view.outro] : [])]) {
    for (const l of wrap(block, regular, 9.5, RIGHT - LEFT)) {
      need(13)
      text(l, LEFT, y)
      y -= 13
    }
    y -= 6
  }

  // ---- every page: footer, page number, stamp ----
  pages.forEach((p, i) => {
    page = p
    const colW = (RIGHT - LEFT) / Math.max(1, view.footer.length)
    p.drawLine({ start: { x: LEFT, y: mm(26) }, end: { x: RIGHT, y: mm(26) }, thickness: 0.5, color: line })
    view.footer.forEach((col, c) => col.slice(0, 4).forEach((l, r) => text(l, LEFT + c * colW, mm(22) - r * 9, { size: 6.8, color: muted })))
    if (pages.length > 1) text(`${view.labels.page} ${i + 1}/${pages.length}`, RIGHT, mm(8), { size: 7, color: muted, align: "right" })
    if (view.stamp) {
      const s = pdfText(view.stamp.toUpperCase())
      const size = 64
      const w = bold.widthOfTextAtSize(s, size)
      p.drawText(s, { x: W / 2 - (w / 2) * Math.cos(Math.PI / 6), y: H / 2 - (w / 2) * Math.sin(Math.PI / 6), size, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(30) })
    }
  })
  return pdf.save()
}
