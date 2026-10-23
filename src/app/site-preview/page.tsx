import { notFound } from "next/navigation"
import { SiteFrame } from "@/app/s/[site]/frame"
import { SiteHome } from "@/app/s/[site]/home"
import { requirePerm } from "@/lib/context"
import { cachedSite } from "@/lib/public-cache"
import { getT } from "@/i18n/server"
import { TemplatedEvent } from "@/app/s/[site]/e/[slug]/event-view"
import { createPublicClient } from "@/lib/supabase/server"
import { loadSite } from "@/site/server"
import { cleanPage } from "@/site/html"
import { renderTemplate } from "@/site/template"

// The draft of the start page with brand, header and footer, exactly as the public page renders it – for the preview
// next to the editors in Website. Outside the App shell (own page in an iframe); website editors only.
export default async function SitePreview({ searchParams }: PageProps<"/site-preview">) {
  const ctx = await requirePerm("org.site.manage")
  const [{ draft }, live, t] = await Promise.all([loadSite(ctx.supabase, ctx.org.id), cachedSite(ctx.org.id), getT()])
  if (!live) notFound()
  const page = (await searchParams).page
  if (page === "portal") {
    // The welcome area as a signed-in member would see it (example name), above where the portal tabs follow.
    return (
      <SiteFrame slug={ctx.org.slug} content={draft}>
        <main className="mx-auto grid max-w-2xl gap-6 px-4 py-8">
          <h1 className="font-heading text-xl font-semibold">{t("portal.hello", { name: "Erika" })}</h1>
          {draft.portal_html && (
            <div className="site-portal-welcome" dangerouslySetInnerHTML={{ __html: cleanPage(renderTemplate(draft.portal_html, { person: { first_name: "Erika", name: "Erika Muster" }, org: { name: ctx.org.name, url: "/" } })) }} />
          )}
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("website.portal.tabsHere")}</p>
        </main>
      </SiteFrame>
    )
  }
  if (page === "event") {
    // The next upcoming public event in the draft's event template (or a note when there's none / no template).
    // Drafts too (the editors' own client): a new event can be designed before it's published.
    const { data: e } = await ctx.supabase.from("events").select("*").eq("org_id", ctx.org.id).is("deleted_at", null).neq("status", "cancelled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle()
    return (
      <SiteFrame slug={ctx.org.slug} content={draft}>
        {!e ? (
          <p className="p-8 text-center text-muted-foreground">{t("website.event.noEvent")}</p>
        ) : !draft.event_html ? (
          <p className="p-8 text-center text-muted-foreground">{t("website.event.standardPreview")}</p>
        ) : (
          <TemplatedEvent site={ctx.org.slug} org={ctx.org} e={e} template={draft.event_html} shop={<p className="rounded-xl border p-4 text-sm text-muted-foreground">{t("website.event.shopHere")}</p>} t={t} />
        )}
      </SiteFrame>
    )
  }
  return (
    <SiteFrame slug={ctx.org.slug} content={draft}>
      <SiteHome slug={ctx.org.slug} org={ctx.org} db={createPublicClient()} tagline={draft.tagline} blocks={draft.blocks} modules={live.modules} forms={live.forms} home={{ mode: draft.home_mode, html: draft.home_html }} legal={{ imprint: !!draft.imprint, privacy: !!draft.privacy }} />
    </SiteFrame>
  )
}

export const instant = false
