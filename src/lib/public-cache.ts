// Public pages of an org (website, event and form pages, Impressum) read their data through cached functions, so a
// visit costs no database round trip. Everything public of one org shares one tag; any change to it calls
// refreshPublic(orgId) (from Server Actions), and nothing is ever older than an hour (safety net).
// Live data stays uncached: ticket availability/shop, waiting-list claims, form submissions, checkout, portal.
import { cacheLife, cacheTag, updateTag } from "next/cache"
import { createPublicClient } from "@/lib/supabase/server"

export const publicTag = (orgId: string) => `public:${orgId}`

/** After a change to an org's public data (Server Actions only): the next visit renders fresh. */
export function refreshPublic(orgId: string) {
  updateTag(publicTag(orgId))
}

export async function cachedOrg(slug: string) {
  "use cache"
  cacheLife("hours")
  cacheTag(`site:${slug}`)
  const { data } = await createPublicClient().from("orgs").select("id, slug, name, logo_path").eq("slug", slug).maybeSingle()
  if (data) cacheTag(publicTag(data.id))
  return data
}

/** The website (null = not live) + what its blocks need: enabled modules, published forms, legal details, events. */
export async function cachedSiteData(orgId: string) {
  "use cache"
  cacheLife("hours")
  cacheTag(publicTag(orgId))
  const db = createPublicClient()
  const now = new Date().toISOString()
  const [{ data: site }, { data: extras }, { data: events }] = await Promise.all([
    db.rpc("public_site", { p_org: orgId, p_slug: "" }),
    db.rpc("public_site_extras", { p_org: orgId }),
    db
      .from("events")
      .select("slug, title, starts_at, venue_name, image_path")
      .eq("org_id", orgId)
      .eq("status", "published")
      .or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`)
      .order("starts_at")
      .limit(24),
  ])
  return { site, extras, events: events ?? [] }
}

export async function cachedSitePage(orgId: string, slug: string) {
  "use cache"
  cacheLife("hours")
  cacheTag(publicTag(orgId))
  const { data } = await createPublicClient().rpc("public_site", { p_org: orgId, p_slug: slug })
  return data
}

export async function cachedEvent(orgId: string, slug: string) {
  "use cache"
  cacheLife("hours")
  cacheTag(publicTag(orgId))
  const { data } = await createPublicClient()
    .from("events")
    .select("id, slug, title, status, starts_at, ends_at, venue_name, venue_address, description, image_path, max_tickets_per_order")
    .eq("org_id", orgId)
    .eq("slug", slug)
    .maybeSingle()
  return data
}

export async function cachedForm(orgId: string, slug: string) {
  "use cache"
  cacheLife("hours")
  cacheTag(publicTag(orgId))
  const { data } = await createPublicClient().rpc("public_form", { p_org: orgId, p_slug: slug })
  return data
}
