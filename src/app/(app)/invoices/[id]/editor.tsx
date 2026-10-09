"use client"

import { useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { TAX_RATES, totals, UNITS } from "@/documents/calc"
import { parsePrice, priceInput } from "@/tickets/price"
import { issueDocument, saveDocument } from "../actions"

export type EditorDoc = {
  id: string
  kind: "quote" | "invoice"
  title: string | null
  contact_id: string | null
  recipient_name: string | null
  recipient_address: string | null
  recipient_email: string | null
  recipient_vat_id: string | null
  issue_date: string | null
  service_from: string | null
  service_to: string | null
  due_date: string | null
  valid_until: string | null
  intro: string | null
  outro: string | null
  notes: string | null
  tax_mode: string
  currency: string
}
type Row = { key: number; title: string; description: string; quantity: string; unit: string; unit_price: string; tax_rate: number }
export type EditorContact = { id: string; name: string; address: string; email: string | null }

const textarea =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
let seq = 0
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || Number(s) || 0

// Quote / invoice builder: header fields are plain form fields, rows live in state and go up as JSON.
export function DocumentEditor({
  doc,
  items,
  contacts,
  defaultTax,
}: {
  doc: EditorDoc
  items: { title: string; description: string | null; quantity: number; unit: string; unit_price: number; tax_rate: number }[]
  contacts: EditorContact[]
  defaultTax: number
}) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((i) => ({
      key: ++seq,
      title: i.title,
      description: i.description ?? "",
      quantity: t.number(Number(i.quantity)),
      unit: i.unit,
      unit_price: priceInput(i.unit_price),
      tax_rate: Number(i.tax_rate),
    })),
  )
  const [small, setSmall] = useState(doc.tax_mode === "small_business")
  const [recipient, setRecipient] = useState({ contact_id: doc.contact_id ?? "", name: doc.recipient_name ?? "", address: doc.recipient_address ?? "", email: doc.recipient_email ?? "" })

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const next = [...rs]
      const [r] = next.splice(i, 1)
      next.splice(i + d, 0, r)
      return next
    })
  const add = () => setRows((rs) => [...rs, { key: ++seq, title: "", description: "", quantity: "1", unit: "flat", unit_price: "", tax_rate: small ? 0 : defaultTax }])
  const sum = totals(rows.map((r) => ({ quantity: num(r.quantity), unit_price: parsePrice(r.unit_price) ?? 0, tax_rate: r.tax_rate })), small)
  const money = (c: number) => t.money(c, doc.currency)
  const payload = JSON.stringify(
    rows.map((r) => ({ title: r.title, description: r.description, quantity: r.quantity, unit: r.unit, unit_price: r.unit_price, tax_rate: small ? 0 : r.tax_rate })),
  )

  return (
    <form action={saveDocument} className="grid gap-6">
      <input type="hidden" name="id" value={doc.id} />
      <input type="hidden" name="items" value={payload} />
      <input type="hidden" name="contact_id" value={recipient.contact_id} />

      <section className="grid gap-4 md:grid-cols-2" aria-label={t("invoices.recipient")}>
        <div className="grid content-start gap-3">
          <h2 className="font-medium">{t("invoices.recipient")}</h2>
          {contacts.length > 0 && (
            <NativeSelect
              aria-label={t("invoices.pickContact")}
              value={recipient.contact_id}
              onChange={(e) => {
                const c = contacts.find((x) => x.id === e.target.value)
                setRecipient(c ? { contact_id: c.id, name: c.name, address: c.address, email: c.email ?? "" } : { ...recipient, contact_id: "" })
              }}
              className="w-full"
            >
              <NativeSelectOption value="">{t("invoices.pickContact")}</NativeSelectOption>
              {contacts.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <div className="grid gap-2">
            <Label htmlFor="d-rname">{t("invoices.recipientName")}</Label>
            <Input id="d-rname" name="recipient_name" value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="d-raddr">{t("invoices.recipientAddress")}</Label>
            <textarea
              id="d-raddr"
              name="recipient_address"
              rows={3}
              value={recipient.address}
              onChange={(e) => setRecipient({ ...recipient, address: e.target.value })}
              maxLength={500}
              placeholder={t("invoices.addressPlaceholder")}
              className={textarea}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="d-remail">{t("invoices.recipientEmail")}</Label>
              <Input id="d-remail" name="recipient_email" type="email" value={recipient.email} onChange={(e) => setRecipient({ ...recipient, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-rvat">{t("invoices.recipientVat")}</Label>
              <Input id="d-rvat" name="recipient_vat_id" defaultValue={doc.recipient_vat_id ?? ""} maxLength={20} placeholder="DE123456789" />
            </div>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <h2 className="font-medium">{t("invoices.details")}</h2>
          <div className="grid gap-2">
            <Label htmlFor="d-title">{t("invoices.titleLabel")}</Label>
            <Input
              id="d-title"
              name="title"
              defaultValue={doc.title ?? ""}
              maxLength={200}
              placeholder={t(doc.kind === "quote" ? "invoices.quoteTitle" : "invoices.invoiceTitle")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="d-issue">{t("invoices.issueDate")}</Label>
              <Input id="d-issue" name="issue_date" type="date" defaultValue={doc.issue_date ?? ""} />
            </div>
            {doc.kind === "invoice" ? (
              <div className="grid gap-2">
                <Label htmlFor="d-due">{t("invoices.dueDate")}</Label>
                <Input id="d-due" name="due_date" type="date" defaultValue={doc.due_date ?? ""} />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="d-valid">{t("invoices.validUntil")}</Label>
                <Input id="d-valid" name="valid_until" type="date" defaultValue={doc.valid_until ?? ""} />
              </div>
            )}
          </div>
          {doc.kind === "invoice" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="d-sfrom">{t("invoices.serviceFrom")}</Label>
                <Input id="d-sfrom" name="service_from" type="date" defaultValue={doc.service_from ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="d-sto">{t("invoices.serviceTo")}</Label>
                <Input id="d-sto" name="service_to" type="date" defaultValue={doc.service_to ?? ""} />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("invoices.datesHint")}</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="tax_mode" value="small_business" checked={small} onChange={(e) => setSmall(e.target.checked)} className="mt-0.5 size-4" />
            <span>
              {t("invoices.smallBusiness")}
              <span className="block text-xs text-muted-foreground">{t("invoices.smallBusinessHint")}</span>
            </span>
          </label>
        </div>
      </section>

      <div className="grid gap-2">
        <Label htmlFor="d-intro">{t("invoices.intro")}</Label>
        <textarea id="d-intro" name="intro" rows={3} defaultValue={doc.intro ?? ""} maxLength={5000} className={textarea} />
      </div>

      <section className="grid gap-3" aria-labelledby="items">
        <h2 id="items" className="font-medium">
          {t("invoices.items")}
        </h2>
        <ol className="grid gap-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="w-6 text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
                <Input
                  value={r.title}
                  onChange={(e) => update(r.key, { title: e.target.value })}
                  placeholder={t("invoices.itemTitle")}
                  aria-label={t("invoices.itemTitle")}
                  required
                  maxLength={300}
                  className="flex-1 font-medium"
                />
                <RowButton label={t("invoices.up")} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpIcon />
                </RowButton>
                <RowButton label={t("invoices.down")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownIcon />
                </RowButton>
                <RowButton label={t("invoices.removeItem")} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Trash2Icon />
                </RowButton>
              </div>
              <textarea
                value={r.description}
                onChange={(e) => update(r.key, { description: e.target.value })}
                placeholder={t("invoices.itemDescription")}
                aria-label={t("invoices.itemDescription")}
                rows={2}
                maxLength={5000}
                className={textarea}
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_9rem_8rem_6rem_1fr] sm:items-center">
                <Input value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} inputMode="decimal" aria-label={t("invoices.quantity")} />
                <NativeSelect value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} aria-label={t("invoices.unit")} className="w-full">
                  {UNITS.map((u) => (
                    <NativeSelectOption key={u} value={u}>
                      {t.dynamic(`invoices.units.${u}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  value={r.unit_price}
                  onChange={(e) => update(r.key, { unit_price: e.target.value })}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={t("invoices.unitPriceNet")}
                />
                <NativeSelect
                  value={small ? 0 : r.tax_rate}
                  disabled={small}
                  onChange={(e) => update(r.key, { tax_rate: Number(e.target.value) })}
                  aria-label={t("invoices.taxRate")}
                  className="w-full"
                >
                  {TAX_RATES.map((x) => (
                    <NativeSelectOption key={x} value={x}>
                      {x} %
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <span className="col-span-2 text-right text-sm font-medium tabular-nums sm:col-span-1">
                  {money(Math.round(num(r.quantity) * (parsePrice(r.unit_price) ?? 0)))}
                </span>
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" size="sm" onClick={add} className="justify-self-start">
          <PlusIcon /> {t("invoices.addItem")}
        </Button>
        <dl className="ml-auto grid min-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          {!small && (
            <>
              <dt className="text-muted-foreground">{t("invoices.net")}</dt>
              <dd className="text-right tabular-nums">{money(sum.net)}</dd>
              {sum.taxes.map((x) => (
                <div key={x.rate} className="contents">
                  <dt className="text-muted-foreground">{t("invoices.vat", { rate: String(x.rate) })}</dt>
                  <dd className="text-right tabular-nums">{money(x.tax)}</dd>
                </div>
              ))}
            </>
          )}
          <dt className="border-t pt-1 font-semibold">{t(small ? "invoices.total" : "invoices.gross")}</dt>
          <dd className="border-t pt-1 text-right font-semibold tabular-nums">{money(sum.gross)}</dd>
        </dl>
      </section>

      <div className="grid gap-2">
        <Label htmlFor="d-outro">{t("invoices.outro")}</Label>
        <textarea id="d-outro" name="outro" rows={3} defaultValue={doc.outro ?? ""} maxLength={5000} className={textarea} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="d-notes">{t("invoices.notes")}</Label>
        <textarea id="d-notes" name="notes" rows={2} defaultValue={doc.notes ?? ""} maxLength={5000} className={textarea} />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="outline">{t("common.save")}</SubmitButton>
        <SubmitButton formAction={issueDocument}>{t(doc.kind === "quote" ? "invoices.issueQuote" : "invoices.issueInvoice")}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{t("invoices.issueHint")}</p>
    </form>
  )
}

function RowButton({ label, children, ...props }: { label: string; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} {...props} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
