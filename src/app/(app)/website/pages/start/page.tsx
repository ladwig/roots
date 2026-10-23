import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { BLOCK_TYPES, blockAvailable } from "@/site/blocks"
import { loadSite } from "@/site/server"
import { saveWebsiteDraft } from "../../actions"
import { Preview, PublishBar } from "../../publish-bar"
import { SiteEditor } from "./editor"
import { HtmlEditor } from "./html-editor"
import { STARTER } from "@/site/template"
import { Segments } from "@/components/segments"

// Website › Seiten › Startseite: tagline + blocks (own texts and what the active modules offer).
export default async function StartPage({ searchParams }: PageProps<"/website/pages/start">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const has = (m: string) => ctx.modules.has(m)
  const now = new Date().toISOString()
  const [site, { data: events }, { data: forms }] = await Promise.all([
    loadSite(ctx.supabase, ctx.org.id),
    has("events") ? ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).neq("status", "draft").gte("starts_at", now).order("starts_at").limit(50) : Promise.resolve({ data: null }),
    has("forms") ? ctx.supabase.from("forms").select("slug, title").eq("org_id", ctx.org.id).eq("status", "published").is("deleted_at", null).order("title") : Promise.resolve({ data: null }),
  ])
  // View: blocks or own HTML (?mode=); saving in a view makes it the start page's mode.
  const mode = (param(sp, "mode") ?? site.draft.home_mode) === "html" ? "html" : "blocks"
  return (
    <>
      <PageHeader crumbs={[{ label: t("website.pages.nav"), href: "/website/pages" }, { label: t("website.pages.start") }]} title={t("website.pages.start")} description={t("site.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "", ctx.org.site_domain)} back="/website/pages/start" />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveWebsiteDraft} className="grid content-start gap-6">
          <input type="hidden" name="back" value={`/website/pages/start`} />
          <input type="hidden" name="home_mode" value={mode} />
          <Segments
            label={t("website.html.mode")}
            items={[
              { href: "?mode=blocks", label: t("website.html.blocks"), current: mode === "blocks" },
              { href: "?mode=html", label: t("website.html.own"), current: mode === "html" },
            ]}
          />
          <FormCard title={t("site.headTitle")} description={t("site.headHint")}>
            <div className="grid gap-2">
              <Label htmlFor="tagline">{t("site.tagline")}</Label>
              <Input id="tagline" name="tagline" defaultValue={site.draft.tagline ?? ""} maxLength={300} placeholder={t("site.taglinePlaceholder")} />
            </div>
          </FormCard>
          {mode === "html" ? (
            <FormCard title={t("website.html.title")} description={t("website.html.hint")}>
              <HtmlEditor defaultValue={site.draft.home_html ?? STARTER} />
            </FormCard>
          ) : (
          <FormCard title={t("site.blocksTitle")} description={t("site.blocksHint")}>
            <SiteEditor
              initial={site.draft.blocks}
              types={BLOCK_TYPES.filter((b) => blockAvailable(b.type, ctx.modules)).map((b) => b.type)}
              events={(events ?? []).map((e) => ({ value: e.id, label: `${e.title} · ${t.date(e.starts_at, { dateStyle: "medium" })}` }))}
              forms={(forms ?? []).map((f) => ({ value: f.slug, label: f.title }))}
            />
          </FormCard>
          )}
          <SaveBar label={t("website.saveDraft")} />
        </form>
        <Preview t={t} version={site.version} />
      </div>
    </>
  )
}

export const instant = false
