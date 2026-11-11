import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalContact } from "@/portal/session"
import { getSite } from "../../../data"

// A document the org shared with a tenant (a file on their rental with meta.portal, e.g. the contract): only for the
// signed-in main tenant of that rental. A short signed link to the private file.
export async function GET(_: Request, { params }: RouteContext<"/s/[site]/portal/file/[file]">) {
  const { site, file } = await params
  const s = await getSite(site)
  const me = s && (await getPortalContact(s.org.id))
  if (!s || !me || !/^[0-9a-f-]{36}$/.test(file)) return new Response("Not found", { status: 404 })
  const db = createAdminClient()
  const { data: f } = await db.from("files").select("name, path, entity, entity_id, meta").eq("id", file).eq("org_id", s.org.id).is("deleted_at", null).maybeSingle()
  if (!f || f.entity !== "rentals" || !f.entity_id || (f.meta as { portal?: boolean } | null)?.portal !== true) return new Response("Not found", { status: 404 })
  const { count } = await db.from("rental_contacts").select("id", { count: "exact", head: true }).eq("org_id", s.org.id).eq("rental_id", f.entity_id).eq("contact_id", me.contact.id).eq("role", "main")
  if (!count) return new Response("Not found", { status: 404 })
  const { data } = await db.storage.from("files").createSignedUrl(f.path, 60, { download: f.name })
  return data ? Response.redirect(data.signedUrl, 302) : new Response("Not found", { status: 404 })
}
