import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { loadSite } from "@/site/server"
import { saveWebsiteDraft } from "../../actions"
import { Preview, PublishBar } from "../../publish-bar"

// Website › Seiten › Kopf- & Fußzeile: own HTML above and below every public page (cleaned: no scripts).
export default async function FramePage({ searchParams }: PageProps<"/website/pages/frame">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const site = await loadSite(ctx.supabase, ctx.org.id)
  const field = (name: "header_html" | "footer_html", label: string, placeholder: string) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={site.draft[name] ?? ""} rows={10} maxLength={50000} spellCheck={false} className="font-mono text-xs" placeholder={placeholder} />
    </div>
  )
  return (
    <>
      <PageHeader crumbs={[{ label: t("website.pages.nav"), href: "/website/pages" }, { label: t("website.pages.frame") }]} title={t("website.pages.frame")} description={t("website.frame.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "", ctx.org.site_domain)} back="/website/pages/frame" />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveWebsiteDraft} className="grid content-start gap-6">
          <input type="hidden" name="back" value="/website/pages/frame" />
          <FormCard title={t("website.frame.html")} description={t("website.frame.hint")}>
            {field("header_html", t("website.frame.header"), '<nav class="nav">\n  <a href="/">Start</a>\n  <a href="/e/sommerfest">Sommerfest</a>\n  <a href="https://instagram.com/…" target="_blank">Instagram</a>\n</nav>')}
            {field("footer_html", t("website.frame.footer"), '<div class="sponsors">\n  <img src="https://…/logo.png" alt="Sponsor">\n</div>')}
          </FormCard>
          <SaveBar label={t("website.saveDraft")} />
        </form>
        <Preview t={t} version={site.version} />
      </div>
    </>
  )
}

export const instant = false
