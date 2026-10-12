import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { allowedBlocks, TEMPLATE_KINDS, TEMPLATE_MODULE, type SiteMeta } from "@/sites/blocks"
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
    ctx.supabase.from("site_pages").select("id, kind, title, slug, description, in_nav, published_at, draft, published").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("sites").select("theme").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("site_pages").select("id, kind, title, slug, description, in_nav, published_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("position").order("created_at"),
  ])
  if (!page) notFound()
  const nav = (pages ?? []).filter((p) => p.in_nav && p.kind === "page").map((p) => ({ slug: p.slug, title: p.title }))
  const { meta } = await siteMeta(ctx.org, { theme: site?.theme, nav }, "", t)
  meta.modules = [...ctx.modules] // the editor uses the org's real modules (public_site_extras is empty until live)
  meta.editorLinks = Object.fromEntries((pages ?? []).filter((p) => p.kind === "page").map((p) => [p.slug, `/website/${p.id}/edit`]))
  // Templates preview with a real record: the next event / the first published form.
  if (page.kind === "event") {
    const { data: e } = await ctx.supabase
      .from("events")
      .select("slug, title, status, starts_at, ends_at, venue_name, venue_address, description, image_path")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    meta.context = { event: (e ?? undefined) as NonNullable<SiteMeta["context"]>["event"] }
  }
  if (page.kind === "form") {
    const { data: f } = await ctx.supabase.from("forms").select("title, intro").eq("org_id", ctx.org.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle()
    meta.context = { form: f ?? undefined }
  }
  const { draft, published, ...info } = page
  return (
    <SiteEditor
      page={info}
      draft={draft}
      published={published}
      pages={pages ?? []}
      theme={readTheme(site?.theme)}
      meta={meta}
      allowed={allowedBlocks(meta.modules, page.kind)}
      templateKinds={TEMPLATE_KINDS.filter((k) => ctx.modules.has(TEMPLATE_MODULE[k]))}
      siteRoot={siteUrl(ctx.org.slug, "/").replace(/\/?$/, "/")}
    />
  )
}

export const instant = false
