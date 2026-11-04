import { createAdminClient } from "@/lib/supabase/admin"
import { orderFiles, orderForBuyer } from "@/shop/server"
import { getSite } from "../../../../data"

// A download of a paid digital product (order id + token): a short signed link to the private file.
export async function GET(request: Request, { params }: RouteContext<"/s/[site]/o/[order]/file/[file]">) {
  const { site, order, file } = await params
  const token = new URL(request.url).searchParams.get("k") ?? ""
  const s = await getSite(site)
  const o = s && (await orderForBuyer(order, token))
  if (!s || !o || o.org_id !== s.org.id) return new Response("Not found", { status: 404 })
  const f = (await orderFiles(o)).find((x) => x.id === file)
  if (!f) return new Response("Not found", { status: 404 })
  const db = createAdminClient()
  const { data: row } = await db.from("files").select("path").eq("id", f.id).single()
  const { data } = row ? await db.storage.from("files").createSignedUrl(row.path, 60, { download: f.name }) : { data: null }
  if (!data) return new Response("Not found", { status: 404 })
  return Response.redirect(data.signedUrl, 302)
}
