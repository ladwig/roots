import { createAdminClient } from "@/lib/supabase/admin"
import type { CatalogProduct } from "@/shop/fields"
import { productTracks } from "@/shop/server"
import { getSite } from "../../../../data"

// Streams one track of a published product: a short signed link to the private audio file (the browser follows the
// redirect and seeks with range requests there). Tracks the org marked "buyers only" aren't streamed.
export async function GET(_req: Request, { params }: RouteContext<"/s/[site]/shop/[slug]/track/[file]">) {
  const { site, slug, file } = await params
  const s = await getSite(site)
  const { data } = s ? await s.db.rpc("shop_catalog", { p_org: s.org.id, p_slug: slug }) : { data: null }
  const p = ((data ?? []) as CatalogProduct[])[0]
  const track = p && (await productTracks(s!.org.id, p.id)).find((x) => x.id === file && x.stream)
  if (!track) return new Response("Not found", { status: 404 })
  const db = createAdminClient()
  const { data: row } = await db.from("files").select("path").eq("id", track.id).single()
  const { data: url } = row ? await db.storage.from("files").createSignedUrl(row.path, 3600) : { data: null }
  if (!url) return new Response("Not found", { status: 404 })
  return new Response(null, { status: 302, headers: { location: url.signedUrl, "cache-control": "private, max-age=600" } })
}
