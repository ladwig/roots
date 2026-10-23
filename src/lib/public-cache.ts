// Public pages of an org (event and form pages) read their data through cached functions, so a
// visit costs no database round trip. Everything public of one org shares one tag; any change to it calls
// refreshPublic(orgId) (from Server Actions) for an immediate update; without it data is at most ~1 minute old
// (cacheLife "minutes" = safety net, so a forgotten refresh costs little).
// Live data stays uncached: ticket availability/shop, waiting-list claims, form submissions, checkout, portal.
import { cacheLife, cacheTag, revalidateTag, updateTag } from "next/cache"
import { createPublicClient } from "@/lib/supabase/server"

export const publicTag = (orgId: string) => `public:${orgId}`

/** After a change to an org's public data (Server Actions only): the next visit renders fresh. */
export function refreshPublic(orgId: string) {
  updateTag(publicTag(orgId))
}
/** Same from a Route Handler (API), where updateTag isn't available: the next visit blocks for fresh data. */
export function refreshPublicFromApi(orgId: string) {
  revalidateTag(publicTag(orgId), { expire: 0 })
}

export async function cachedOrg(slug: string) {
  "use cache"
  cacheLife("minutes")
  cacheTag(`site:${slug}`)
  const { data } = await createPublicClient().from("orgs").select("id, slug, name, logo_path, site_domain").eq("slug", slug).maybeSingle()
  if (data) cacheTag(publicTag(data.id))
  return data
}

export async function cachedEvent(orgId: string, slug: string) {
  "use cache"
  cacheLife("minutes")
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
  cacheLife("minutes")
  cacheTag(publicTag(orgId))
  const { data } = await createPublicClient().rpc("public_form", { p_org: orgId, p_slug: slug })
  return data
}

/** The org's start page (blocks, tagline, legal texts) + its modules and published forms. */
export async function cachedSite(orgId: string) {
  "use cache"
  cacheLife("minutes")
  cacheTag(publicTag(orgId))
  const { data } = await createPublicClient().rpc("public_site", { p_org: orgId })
  return data as {
    tagline: string | null
    blocks: unknown
    imprint: string | null
    privacy: string | null
    saved: boolean
    theme: unknown
    css: string | null
    header_html: string | null
    footer_html: string | null
    home_mode: "blocks" | "html"
    home_html: string | null
    event_html: string | null
    modules: string[]
    forms: { slug: string; title: string; intro: string | null }[]
  } | null
}
