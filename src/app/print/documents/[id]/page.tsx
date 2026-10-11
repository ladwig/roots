import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { param } from "@/lib/url"
import { buildView, type Seller } from "@/documents/model"
import { DocumentPage, TEMPLATES } from "@/documents/templates"
import { PrintBar } from "./print-bar"

// Print view of a quote/invoice outside the app shell: the browser's print dialog makes the PDF.
// ponytail: browser PDF for now; a server renderer can render the same DocumentPage later (e.g. for email attachments).
export default async function PrintDocument({ params, searchParams }: PageProps<"/print/documents/[id]">) {
  const ctx = await requirePerm("invoices.view")
  if (!ctx.modules.has("invoices")) notFound()
  const { id } = await params
  const sp = await searchParams
  const [{ data: doc }, { data: billing }] = await Promise.all([
    ctx.supabase.from("documents").select("*, document_items(*)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("org_billing").select("*").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  if (!doc) notFound()
  const t = await getT()
  const { data: source } = doc.source_id
    ? await ctx.supabase.from("documents").select("number, issue_date").eq("id", doc.source_id).eq("org_id", ctx.org.id).maybeSingle()
    : { data: null }
  // Issued: the frozen seller snapshot; drafts: current settings.
  const seller = ((doc.status !== "draft" && doc.seller) || billing || { tax_mode: "standard" }) as Seller
  const template = TEMPLATES.find((x) => x === param(sp, "template")) ?? TEMPLATES.find((x) => x === billing?.template) ?? "classic"
  const view = buildView(
    doc,
    doc.document_items.map((i) => ({ ...i, quantity: Number(i.quantity), tax_rate: Number(i.tax_rate) })),
    seller,
    (ctx.org.logo_path && imageUrl(ctx.org.logo_path)) || null,
    t,
    source,
  )
  return (
    <div className="min-h-screen bg-muted py-6 print:bg-transparent print:py-0">
      <style>{`@page { size: A4; margin: 0 } @media print { .print-hide { display: none !important } .document-page { box-shadow: none !important } }`}</style>
      <PrintBar template={template} filename={`${view.title} ${doc.number ?? ""}`.trim()} />
      <div className="mx-auto w-fit shadow-lg print:shadow-none">
        <DocumentPage view={view} template={template} />
      </div>
    </div>
  )
}

export const instant = false
