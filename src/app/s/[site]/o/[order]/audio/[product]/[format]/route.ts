import { audioDownloadUrl } from "@/shop/audio"
import { orderForBuyer, orderMusic } from "@/shop/server"
import { getSite } from "../../../../../data"

// Music download for the buyer (order id + token): the album ZIP, or one track (?t=), in mp3 | flac | wav → a
// short-lived link to the file in R2, named for the buyer.
export async function GET(request: Request, { params }: RouteContext<"/s/[site]/o/[order]/audio/[product]/[format]">) {
  const { site, order, product, format } = await params
  const sp = new URL(request.url).searchParams
  const s = await getSite(site)
  const o = s && (await orderForBuyer(order, sp.get("k") ?? ""))
  if (!s || !o || o.org_id !== s.org.id || !(await orderMusic(o)).some((m) => m.productId === product)) return new Response("Not found", { status: 404 })
  const url = await audioDownloadUrl(o.org_id, product, format, sp.get("t"))
  return url ? Response.redirect(url, 302) : new Response("Not found", { status: 404 })
}
