import type { CatalogProduct } from "@/shop/fields"
import { streamUrl } from "@/shop/audio"
import { getSite } from "../../../../data"

// Streams one track of a published product: a short-lived link to its 128k stream MP3 in R2 (the browser follows the
// redirect and seeks with range requests there). Masters and download formats are never streamed; "buyers only"
// tracks aren't either.
export async function GET(_req: Request, { params }: RouteContext<"/s/[site]/shop/[slug]/track/[file]">) {
  const { site, slug, file } = await params
  const s = await getSite(site)
  const { data } = s ? await s.db.rpc("shop_catalog", { p_org: s.org.id, p_slug: slug }) : { data: null }
  const p = ((data ?? []) as CatalogProduct[])[0]
  const url = p && /^[0-9a-f-]{36}$/.test(file) ? await streamUrl(s!.org.id, p.id, file) : null
  if (!url) return new Response("Not found", { status: 404 })
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=600" } })
}
