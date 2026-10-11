import { getT } from "@/i18n/server"
import { orderPdf, ticketsForBuyer } from "@/tickets/server"
import { getSite } from "../../../data"

// Buyer's tickets as PDF (same access as the ticket page: order id + token).
export async function GET(request: Request, { params }: RouteContext<"/s/[site]/t/[order]/pdf">) {
  const { site, order } = await params
  const token = new URL(request.url).searchParams.get("k") ?? ""
  const s = await getSite(site)
  const data = s && (await ticketsForBuyer(order, token))
  if (!s || !data || data.order.org_id !== s.org.id) return new Response("Not found", { status: 404 })
  const pdf = await orderPdf(order, await getT())
  if (!pdf) return new Response("Not found", { status: 404 })
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="tickets-${order.slice(0, 8)}.pdf"`, "cache-control": "private, no-store" },
  })
}
