import { NextResponse } from "next/server"
import { loadDocView, pdfLogo } from "@/documents/load"
import { renderPdf } from "@/documents/pdf"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"

// The document as a PDF file (server-rendered, same content as the print view).
export async function GET(_req: Request, { params }: RouteContext<"/print/documents/[id]/pdf">) {
  const { id } = await params
  const ctx = await requirePerm("invoices.view")
  if (!ctx.modules.has("invoices")) return new NextResponse("Not found", { status: 404 })
  const loaded = await loadDocView(ctx, id, await getT())
  if (!loaded) return new NextResponse("Not found", { status: 404 })
  const { view, doc } = loaded
  const bytes = await renderPdf(view, await pdfLogo(view.logoUrl))
  const name = `${view.title} ${doc.number ?? ""}`.trim().replace(/[^\p{L}\p{N} ._-]/gu, "_")
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf` },
  })
}
