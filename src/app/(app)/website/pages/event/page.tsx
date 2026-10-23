import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { FormCard, PageHeader } from "@/components/page"
import { AutoSave } from "@/app/(app)/website/autosave"
import { Segments } from "@/components/segments"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { loadSite } from "@/site/server"
import { EVENT_STARTER } from "@/site/template"
import { saveWebsiteDraft } from "../../actions"
import { Preview, PublishBar } from "../../publish-bar"
import { HtmlEditor } from "../start/html-editor"

// Website › Seiten › Eventseite: one template for all event pages (own HTML around roots' fixed blocks).
export default async function EventTemplatePage({ searchParams }: PageProps<"/website/pages/event">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const site = await loadSite(ctx.supabase, ctx.org.id)
  const own = (param(sp, "mode") ?? (site.draft.event_html ? "html" : "standard")) === "html"
  return (
    <>
      <PageHeader crumbs={[{ label: t("website.pages.nav"), href: "/website/pages" }, { label: t("website.pages.event") }]} title={t("website.pages.event")} description={t("website.event.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "", ctx.org.site_domain)} back="/website/pages/event" />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveWebsiteDraft} className="grid content-start gap-6">
          <input type="hidden" name="back" value="/website/pages/event" />
          <Segments
            label={t("website.html.mode")}
            items={[
              { href: "?mode=standard", label: t("website.event.standard"), current: !own },
              { href: "?mode=html", label: t("website.event.own"), current: own },
            ]}
          />
          {own ? (
            <FormCard title={t("website.event.title")} description={t("website.event.hint")}>
              <HtmlEditor name="event_html" kind="event" defaultValue={site.draft.event_html ?? EVENT_STARTER} />
            </FormCard>
          ) : (
            <FormCard title={t("website.event.standard")} description={t("website.event.standardHint")}>
              {site.draft.event_html && (
                // Switching back is a deliberate step (the own template stays in the history only until then).
                <>
                  <input type="hidden" name="event_html" value="" />
                  <SubmitButton variant="outline" size="sm" className="justify-self-start">
                    {t("website.event.useStandard")}
                  </SubmitButton>
                </>
              )}
            </FormCard>
          )}
          <AutoSave />
        </form>
        <Preview t={t} version={site.version} path="?page=event" />
      </div>
    </>
  )
}

export const instant = false
