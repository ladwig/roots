import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { allowedBlocks } from "@/sites/blocks"
import { SiteEditor } from "@/sites/editor"
import { siteMeta } from "@/sites/server"

export const metadata = { title: "Editor" }

// Full-screen website editor (outside the App shell; Puck's code only loads here).
export default async function EditSitePage({ params }: PageProps<"/website/[id]/edit">) {
  const { id } = await params
  const ctx = await requirePerm("sites.manage")
  if (!ctx.modules.has("sites") || !/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getT()
  const [{ data: page }, { data: site }, { data: nav }] = await Promise.all([
    ctx.supabase.from("site_pages").select("id, title, slug, draft").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("sites").select("theme").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("site_pages").select("slug, title").eq("org_id", ctx.org.id).is("deleted_at", null).eq("in_nav", true).order("position").order("created_at"),
  ])
  if (!page) notFound()
  const { meta } = await siteMeta(ctx.org, { theme: site?.theme, nav: nav ?? [] }, "", t)
  // The editor uses the org's real modules (public_site_extras is empty until the site is live).
  meta.modules = [...ctx.modules]
  return <SiteEditor page={page} meta={meta} allowed={allowedBlocks(meta.modules)} viewUrl={siteUrl(ctx.org.slug, `/${page.slug}`)} />
}

export const instant = false
