// The document as printed: one neutral model that every template renders (browser print today; a server PDF
// renderer can take the same model later). Built from the DB rows + the org's language.
import type { T } from "@/i18n/translate"
import { lineNet, totals } from "./calc"

export type Seller = {
  legal_name: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  email: string | null
  phone: string | null
  website: string | null
  tax_number: string | null
  vat_id: string | null
  tax_mode: string
  register: string | null
  representatives: string | null
  bank_name: string | null
  iban: string | null
  bic: string | null
}
type Doc = {
  kind: string
  status: string
  number: string | null
  title: string | null
  recipient_name: string | null
  recipient_address: string | null
  recipient_vat_id: string | null
  issue_date: string | null
  service_from: string | null
  service_to: string | null
  due_date: string | null
  valid_until: string | null
  intro: string | null
  outro: string | null
  tax_mode: string
  currency: string
  seller: unknown
}
type Item = { position: number; title: string; description: string | null; quantity: number; unit: string; unit_price: number; tax_rate: number }

export type DocView = {
  kind: "quote" | "invoice"
  draft: boolean
  stamp: string | null // "Entwurf" / "Storniert" across the page
  title: string
  logoUrl: string | null
  seller: Seller
  senderLine: string
  recipient: string[]
  meta: { label: string; value: string }[]
  intro: string | null
  outro: string | null
  items: { pos: number; title: string; description: string | null; quantity: string; unit: string; unitPrice: string; taxRate: string | null; total: string }[]
  totals: { label: string; value: string; strong?: boolean }[]
  notes: string[] // legal notes (e.g. § 19 UStG)
  footer: string[][] // columns of lines
  labels: { pos: string; description: string; quantity: string; unitPrice: string; tax: string; total: string; page: string }
}

const iban = (v: string) => v.replace(/(.{4})/g, "$1 ").trim()

export function buildView(doc: Doc, items: Item[], seller: Seller, logoUrl: string | null, t: T): DocView {
  const kind = doc.kind === "quote" ? "quote" : "invoice"
  const small = doc.tax_mode === "small_business"
  const money = (c: number) => t.money(c, doc.currency)
  const date = (d: string | null) => (d ? t.date(`${d}T12:00:00Z`, { dateStyle: "medium" }) : "")
  const sum = totals(items.map((i) => ({ quantity: Number(i.quantity), unit_price: i.unit_price, tax_rate: Number(i.tax_rate) })), small)
  const service =
    doc.service_from && doc.service_to && doc.service_to !== doc.service_from ? `${date(doc.service_from)} – ${date(doc.service_to)}` : date(doc.service_from)
  const address = [seller.street, [seller.postal_code, seller.city].filter(Boolean).join(" ")].filter((l): l is string => !!l)
  return {
    kind,
    draft: doc.status === "draft",
    stamp: doc.status === "draft" ? t("invoices.stampDraft") : doc.status === "cancelled" ? t("invoices.stampCancelled") : null,
    title: doc.title || t(kind === "quote" ? "invoices.quoteTitle" : "invoices.invoiceTitle"),
    logoUrl,
    seller,
    senderLine: [seller.legal_name, ...address].filter(Boolean).join(" · "),
    recipient: [doc.recipient_name ?? "", ...(doc.recipient_address ?? "").split("\n")].filter((l) => l.trim()),
    meta: [
      { label: t(kind === "quote" ? "invoices.quoteNumber" : "invoices.invoiceNumber"), value: doc.number ?? t("invoices.draftNumber") },
      { label: t("invoices.issueDate"), value: date(doc.issue_date) || t("invoices.onIssue") },
      ...(kind === "invoice" && service ? [{ label: t("invoices.serviceDate"), value: service }] : []),
      ...(kind === "invoice" && doc.due_date ? [{ label: t("invoices.dueDate"), value: date(doc.due_date) }] : []),
      ...(kind === "quote" && doc.valid_until ? [{ label: t("invoices.validUntil"), value: date(doc.valid_until) }] : []),
      ...(doc.recipient_vat_id ? [{ label: t("invoices.recipientVat"), value: doc.recipient_vat_id }] : []),
    ],
    intro: doc.intro,
    outro: doc.outro,
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((i, n) => ({
        pos: n + 1,
        title: i.title,
        description: i.description,
        quantity: t.number(Number(i.quantity)),
        unit: t.has(`invoices.units.${i.unit}`) ? t.dynamic(`invoices.units.${i.unit}`) : i.unit,
        unitPrice: money(i.unit_price),
        taxRate: small ? null : `${t.number(Number(i.tax_rate))} %`,
        total: money(lineNet({ quantity: Number(i.quantity), unit_price: i.unit_price, tax_rate: 0 })),
      })),
    totals: small
      ? [{ label: t("invoices.total"), value: money(sum.gross), strong: true }]
      : [
          { label: t("invoices.net"), value: money(sum.net) },
          ...sum.taxes.map((x) => ({ label: t("invoices.vat", { rate: t.number(x.rate) }), value: money(x.tax) })),
          { label: t("invoices.gross"), value: money(sum.gross), strong: true },
        ],
    notes: [
      ...(small ? [t("invoices.smallBusinessNote")] : []),
      ...(kind === "invoice" && doc.due_date ? [t("invoices.payUntil", { date: date(doc.due_date) })] : []),
    ],
    footer: [
      [seller.legal_name ?? "", ...address, seller.representatives ?? ""].filter(Boolean),
      [seller.phone ?? "", seller.email ?? "", seller.website ?? ""].filter(Boolean),
      [
        seller.tax_number ? `${t("invoices.taxNumber")}: ${seller.tax_number}` : "",
        seller.vat_id ? `${t("invoices.vatId")}: ${seller.vat_id}` : "",
        seller.register ?? "",
      ].filter(Boolean),
      [seller.bank_name ?? "", seller.iban ? `IBAN ${iban(seller.iban)}` : "", seller.bic ? `BIC ${seller.bic}` : ""].filter(Boolean),
    ]
      .map((c) => c.filter((l): l is string => !!l))
      .filter((c) => c.length),
    labels: {
      pos: t("invoices.pos"),
      description: t("invoices.description"),
      quantity: t("invoices.quantity"),
      unitPrice: t("invoices.unitPrice"),
      tax: t("invoices.taxRate"),
      total: t("invoices.lineTotal"),
      page: t("invoices.page"),
    },
  }
}
