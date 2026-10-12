import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { loadDocView } from "@/documents/load"
import { DocumentPage, TEMPLATES } from "@/documents/templates"
import { PrintBar } from "./print-bar"

// Print view of a quote/invoice outside the app shell: the browser's print dialog makes the PDF.
// The same document as a server-rendered PDF file: ./pdf (src/documents/pdf.ts).
export default async function PrintDocument({ params, searchParams }: PageProps<"/print/documents/[id]">) {
  const ctx = await requirePerm("invoices.view")
  if (!ctx.modules.has("invoices")) notFound()
  const { id } = await params
  const sp = await searchParams
  const loaded = await loadDocView(ctx, id, await getT())
  if (!loaded) notFound()
  const { doc, billing, view } = loaded
  const template = TEMPLATES.find((x) => x === param(sp, "template")) ?? TEMPLATES.find((x) => x === billing?.template) ?? "classic"
  return (
    <div className="min-h-screen bg-muted py-6 print:bg-transparent print:py-0">
      <style>{`@page { size: A4; margin: 0 } @media print { .print-hide { display: none !important } .document-page { box-shadow: none !important } }`}</style>
      <PrintBar template={template} filename={`${view.title} ${doc.number ?? ""}`.trim()} pdfHref={`/print/documents/${id}/pdf`} />
      <div className="mx-auto w-fit shadow-lg print:shadow-none">
        <DocumentPage view={view} template={template} />
      </div>
    </div>
  )
}

export const instant = false
