import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, CopyIcon, FileOutputIcon, PrinterIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { copyDocument, deleteDraft, setDocumentStatus } from "../actions"
import { DocumentEditor, type EditorContact } from "./editor"

export default async function DocumentPage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  const ctx = await requirePerm("invoices.view")
  if (!ctx.modules.has("invoices")) notFound()
  const { id } = await params
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("invoices.manage")
  const [{ data: doc }, { data: billing }, { data: contacts }] = await Promise.all([
    ctx.supabase.from("documents").select("*, document_items(*)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("org_billing").select("legal_name, street, city, tax_number, vat_id, tax_mode").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.modules.has("crm") && ctx.can("crm.view")
      ? ctx.supabase
          .from("contacts")
          .select("id, first_name, last_name, company, email, street, postal_code, city")
          .eq("org_id", ctx.org.id)
          .is("deleted_at", null)
          .order("company")
          .order("last_name")
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ])
  if (!doc) notFound()
  const draft = doc.status === "draft"
  const items = [...doc.document_items].sort((a, b) => a.position - b.position)
  const person = (c: { first_name: string | null; last_name: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ")
  const pickable: EditorContact[] = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.company || person(c) || c.email || "–",
    address: [c.company ? person(c) : "", c.street ?? "", [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
    email: c.email,
  }))
  const billingMissing = !billing?.legal_name || !billing.street || !billing.city || (doc.kind === "invoice" && !billing.tax_number && !billing.vat_id)
  const status = (s: string, label: string, variant: "default" | "outline" | "destructive" = "outline") => (
    <form action={setDocumentStatus}>
      <input type="hidden" name="id" value={doc.id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton size="sm" variant={variant}>
        {label}
      </SubmitButton>
    </form>
  )

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="grid gap-1">
        <Link href={`/invoices?kind=${doc.kind}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {t("invoices.title")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold">
            {t(doc.kind === "quote" ? "invoices.quoteTitle" : "invoices.invoiceTitle")} {doc.number ?? ""}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={doc.status === "paid" || doc.status === "accepted" ? "default" : doc.status === "cancelled" || doc.status === "declined" ? "destructive" : "outline"}>
              {t.dynamic(`invoices.statuses.${doc.kind}.${doc.status}`)}
            </Badge>
            <Button render={<a href={`/print/documents/${doc.id}`} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
              <PrinterIcon /> {t("invoices.pdf")}
            </Button>
          </div>
        </div>
        {doc.source_id && (
          <Link href={`/invoices/${doc.source_id}`} className="text-sm text-muted-foreground underline underline-offset-4">
            {t("invoices.fromSource")}
          </Link>
        )}
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {draft && billingMissing && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("invoices.billingMissing")}{" "}
          <Link href="/invoices/settings" className="underline underline-offset-4">
            {t("invoices.settings")}
          </Link>
        </p>
      )}

      {draft && canManage ? (
        <>
          <DocumentEditor
            doc={{ ...doc, kind: doc.kind as "quote" | "invoice" }}
            items={items.map((i) => ({ ...i, quantity: Number(i.quantity), tax_rate: Number(i.tax_rate) }))}
            contacts={pickable}
            defaultTax={billing?.tax_mode === "small_business" ? 0 : 19}
          />
          <form action={deleteDraft} className="border-t pt-4">
            <input type="hidden" name="id" value={doc.id} />
            <SubmitButton size="sm" variant="ghost">
              {t("invoices.deleteDraft")}
            </SubmitButton>
          </form>
        </>
      ) : (
        <div className="grid gap-4">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("invoices.recipient")}</dt>
            <dd className="whitespace-pre-line">{[doc.recipient_name, doc.recipient_address].filter(Boolean).join("\n")}</dd>
            <dt className="text-muted-foreground">{t("invoices.issueDate")}</dt>
            <dd>{doc.issue_date && t.date(`${doc.issue_date}T12:00:00Z`)}</dd>
            {doc.due_date && (
              <>
                <dt className="text-muted-foreground">{t("invoices.dueDate")}</dt>
                <dd>{t.date(`${doc.due_date}T12:00:00Z`)}</dd>
              </>
            )}
            {doc.paid_at && (
              <>
                <dt className="text-muted-foreground">{t("invoices.paidAt")}</dt>
                <dd>{t.date(doc.paid_at)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("invoices.gross")}</dt>
            <dd className="font-semibold">{t.money(doc.gross_total, doc.currency)}</dd>
          </dl>
          <ol className="grid gap-1 rounded-lg border p-3 text-sm">
            {items.map((i, n) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  {n + 1}. {i.title} · {t.number(Number(i.quantity))} {t.dynamic(`invoices.units.${i.unit}`)}
                </span>
                <span className="tabular-nums">{t.money(Math.round(Number(i.quantity) * i.unit_price), doc.currency)}</span>
              </li>
            ))}
          </ol>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {doc.kind === "invoice" && doc.status === "sent" && status("paid", t("invoices.markPaid"), "default")}
              {doc.kind === "invoice" && doc.status === "paid" && status("sent", t("invoices.markUnpaid"))}
              {doc.kind === "quote" && doc.status === "sent" && status("accepted", t("invoices.markAccepted"))}
              {doc.kind === "quote" && doc.status === "sent" && status("declined", t("invoices.markDeclined"))}
              {doc.kind === "quote" && doc.status !== "declined" && (
                <form action={copyDocument}>
                  <input type="hidden" name="id" value={doc.id} />
                  <input type="hidden" name="as" value="invoice" />
                  <SubmitButton size="sm">
                    <FileOutputIcon /> {t("invoices.toInvoice")}
                  </SubmitButton>
                </form>
              )}
              <form action={copyDocument}>
                <input type="hidden" name="id" value={doc.id} />
                <SubmitButton size="sm" variant="outline">
                  <CopyIcon /> {t("invoices.duplicate")}
                </SubmitButton>
              </form>
              {doc.kind === "invoice" && (doc.status === "sent" || doc.status === "paid") && (
                <div className="grid gap-1 rounded-lg border border-destructive/30 p-2">
                  {status("cancelled", t("invoices.cancel"), "destructive")}
                  <p className="max-w-xs text-xs text-muted-foreground">{t("invoices.cancelHint")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const instant = false
