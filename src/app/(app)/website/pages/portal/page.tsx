import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { AutoSave } from "@/app/(app)/website/autosave"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { loadSite } from "@/site/server"
import { saveWebsiteDraft } from "../../actions"
import { Preview, PublishBar } from "../../publish-bar"
import { HtmlEditor } from "../start/html-editor"

// Website › Seiten › Mitgliederbereich: own welcome area at the top of the signed-in portal. The portal's blocks
// (membership, tickets, courses, rentals, infos) come from the modules and show for the people they concern.
export default async function PortalPage({ searchParams }: PageProps<"/website/pages/portal">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const site = await loadSite(ctx.supabase, ctx.org.id)
  return (
    <>
      <PageHeader crumbs={[{ label: t("website.pages.nav"), href: "/website/pages" }, { label: t("website.pages.portal") }]} title={t("website.pages.portal")} description={t("website.portal.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "/portal", ctx.org.site_domain)} back="/website/pages/portal" />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveWebsiteDraft} className="grid content-start gap-6">
          <input type="hidden" name="back" value="/website/pages/portal" />
          <FormCard title={t("website.portal.welcome")} description={t("website.portal.hint")}>
            <HtmlEditor name="portal_html" kind="portal" rows={14} defaultValue={site.draft.portal_html ?? ""} />
          </FormCard>
          <AutoSave />
        </form>
        <Preview t={t} version={site.version} path="?page=portal" />
      </div>
    </>
  )
}

export const instant = false
