import { loadDocView, pdfLogo } from "@/documents/load"
import { renderPdf } from "@/documents/pdf"
import { orgT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { orderForBuyer } from "@/shop/server"
import { getSite } from "../../../data"

// The order's invoice as PDF for the buyer (order id + token).
export async function GET(request: Request, { params }: RouteContext<"/s/[site]/o/[order]/invoice">) {
  const { site, order } = await params
  const token = new URL(request.url).searchParams.get("k") ?? ""
  const s = await getSite(site)
  const o = s && (await orderForBuyer(order, token))
  if (!s || !o || o.org_id !== s.org.id || !o.invoice_id) return new Response("Not found", { status: 404 })
  const loaded = await loadDocView({ supabase: createAdminClient(), org: { id: o.org_id, logo_path: o.orgs.logo_path } }, o.invoice_id, await orgT(o.org_id))
  if (!loaded || loaded.doc.status === "draft") return new Response("Not found", { status: 404 })
  const bytes = await renderPdf(loaded.view, await pdfLogo(loaded.view.logoUrl))
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${loaded.doc.number}.pdf"`, "cache-control": "private, no-store" },
  })
}
