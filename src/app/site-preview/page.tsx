import { notFound } from "next/navigation"
import { SiteFrame } from "@/app/s/[site]/frame"
import { SiteHome } from "@/app/s/[site]/home"
import { requirePerm } from "@/lib/context"
import { cachedEvent, cachedSite } from "@/lib/public-cache"
import { getT } from "@/i18n/server"
import { TemplatedEvent } from "@/app/s/[site]/e/[slug]/event-view"
import { createPublicClient } from "@/lib/supabase/server"
import { loadSite } from "@/site/server"

// The draft of the start page with brand, header and footer, exactly as the public page renders it – for the preview
// next to the editors in Website. Outside the App shell (own page in an iframe); website editors only.
export default async function SitePreview({ searchParams }: PageProps<"/site-preview">) {
  const ctx = await requirePerm("org.site.manage")
  const [{ draft }, live, t] = await Promise.all([loadSite(ctx.supabase, ctx.org.id), cachedSite(ctx.org.id), getT()])
  if (!live) notFound()
  if ((await searchParams).page === "event") {
    // The next upcoming public event in the draft's event template (or a note when there's none / no template).
    const db = createPublicClient()
    const { data: next } = await db.from("events").select("slug").eq("org_id", ctx.org.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle()
    const e = next && (await cachedEvent(ctx.org.id, next.slug))
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
