import { audioDownloadUrl } from "@/shop/audio"
import { orderForBuyer, orderMusic } from "@/shop/server"
import { getSite } from "../../../../../data"

// Music download for the buyer (order id + token): the album ZIP (format "zip"), or one track (?t=) as mp3 | wav → a
// short-lived link to the file in R2, named for the buyer.
export async function GET(request: Request, { params }: RouteContext<"/s/[site]/o/[order]/audio/[product]/[format]">) {
  const { site, order, product, format } = await params
  const sp = new URL(request.url).searchParams
  const s = await getSite(site)
  const o = s && (await orderForBuyer(order, sp.get("k") ?? ""))
  const m = s && o && o.org_id === s.org.id ? (await orderMusic(o)).find((x) => x.productId === product) : null
  const track = sp.get("t")
  // Only what this order unlocked: the ZIP for whole products, single tracks only if they're in it.
  if (!m || (format === "zip" ? !m.zip : !track || !m.tracks.some((x) => x.id === track))) return new Response("Not found", { status: 404 })
  const url = await audioDownloadUrl(o!.org_id, product, format, track)
  return url ? Response.redirect(url, 302) : new Response("Not found", { status: 404 })
}
