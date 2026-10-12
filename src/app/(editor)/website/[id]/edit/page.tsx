import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { allowedBlocks } from "@/sites/blocks"
import { SiteEditor } from "@/sites/editor"
import { siteMeta } from "@/sites/server"
import { readTheme } from "@/sites/theme"

export const metadata = { title: "Website" }

// Full-screen website editor (outside the App shell; Puck's code only loads here). All pages + settings live here.
export default async function EditSitePage({ params }: PageProps<"/website/[id]/edit">) {
  const { id } = await params
  const ctx = await requirePerm("sites.manage")
  if (!ctx.modules.has("sites") || !/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getT()
  const [{ data: page }, { data: site }, { data: pages }] = await Promise.all([
    ctx.supabase.from("site_pages").select("id, title, slug, description, in_nav, published_at, draft, published").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("sites").select("theme").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("site_pages").select("id, title, slug, description, in_nav, published_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("position").order("created_at"),
  ])
  if (!page) notFound()
  const nav = (pages ?? []).filter((p) => p.in_nav).map((p) => ({ slug: p.slug, title: p.title }))
  const { meta } = await siteMeta(ctx.org, { theme: site?.theme, nav }, "", t)
  meta.modules = [...ctx.modules] // the editor uses the org's real modules (public_site_extras is empty until live)
  const { draft, published, ...info } = page
  return (
    <SiteEditor
      page={info}
      draft={draft}
      published={published}
      pages={pages ?? []}
      theme={readTheme(site?.theme)}
      meta={meta}
      allowed={allowedBlocks(meta.modules)}
      siteRoot={siteUrl(ctx.org.slug, "/").replace(/\/?$/, "/")}
    />
  )
}

export const instant = false
