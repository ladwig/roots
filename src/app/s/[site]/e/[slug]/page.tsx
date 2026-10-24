import Link from "next/link"
import { param, sitePath } from "@/lib/url"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { readEventLinks } from "@/site/blocks"
import { getT } from "@/i18n/server"
import type { Metadata } from "next"
import { imageUrl, imageUrlOn } from "@/lib/images"
import { cachedEvent, cachedSite } from "@/lib/public-cache"
import { getSite } from "../../data"
import { TemplatedEvent, Timetable } from "./event-view"
import { TicketShop } from "./shop"

// Shared links show the event: title, date + place, its picture (else the org logo), the org as site name.
export async function generateMetadata({ params }: PageProps<"/s/[site]/e/[slug]">): Promise<Metadata> {
  const { site, slug } = await params
  const s = await getSite(site)
  const e = s && (await cachedEvent(s.org.id, slug))
  if (!s || !e) return {}
  const t = await getT()
  const description = [t.date(e.starts_at, { dateStyle: "full", timeStyle: "short" }), e.venue_name].filter(Boolean).join(" · ")
  const image = imageUrlOn(e.image_path ?? s.org.logo_path, s.org.site_domain)
  return {
    title: e.title,
    description,
    openGraph: { type: "website", siteName: s.org.name, title: `${e.title} · ${s.org.name}`, description, images: image ? [image] : undefined },
    twitter: { card: e.image_path ? "summary_large_image" : "summary", title: e.title, description, images: image ? [image] : undefined },
  }
}

export default async function PublicEvent({ params, searchParams }: PageProps<"/s/[site]/e/[slug]">) {
  const { site, slug } = await params
  const sp = await searchParams
  const code = param(sp, "code")?.trim().toUpperCase().slice(0, 40) || null
  const waitlist = param(sp, "w")?.trim().slice(0, 64) || null
  const s = await getSite(site)
  if (!s) notFound()
  const [e, siteData] = await Promise.all([cachedEvent(s.org.id, slug), cachedSite(s.org.id)])
  if (!e) notFound()
  const shop = () => (e.status === "published" ? <TicketShop site={site} slug={slug} eventId={e.id} max={e.max_tickets_per_order} code={code} waitlist={waitlist} codeField={e.show_code_field} /> : null)
  const t = await getT()
  if (siteData?.event_html) return <TemplatedEvent site={site} org={s.org} e={e} template={siteData.event_html} shop={shop()} t={t} />
  const sameDay = e.ends_at && new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() < 86_400_000

  return (
    <main className="site-event-page mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <Link href={sitePath(site)} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {s.org.name} · {t("site.back")}
      </Link>
      {e.image_path && (
        // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, no optimizer needed yet
        <img src={imageUrl(e.image_path)} alt="" className="aspect-video w-full rounded-xl border object-cover" />
      )}
      <header className="grid gap-2">
        {e.status === "cancelled" && <Badge variant="destructive">{t("site.cancelled")}</Badge>}
        <h1 className="site-event-title font-heading text-3xl font-semibold">{e.title}</h1>
        <p className="text-muted-foreground">
          {t.date(e.starts_at, { dateStyle: "full", timeStyle: "short" })}
          {e.ends_at &&
            ` – ${sameDay ? t.date(e.ends_at, { timeStyle: "short" }) : t.date(e.ends_at, { dateStyle: "full", timeStyle: "short" })}`}
        </p>
        {(e.venue_name || e.venue_address) && (
          <p>
            {e.venue_name}
            {e.venue_address && <span className="block text-sm text-muted-foreground">{e.venue_address}</span>}
          </p>
        )}
      </header>
      {e.description && <p className="whitespace-pre-line">{e.description}</p>}
      <Timetable eventId={e.id} />
      {shop()}
      {readEventLinks(e.links).length > 0 && (
        <div className="site-event-links flex flex-wrap gap-2">
          {readEventLinks(e.links).map((l) => (
            <Button key={l.url} variant="outline" render={<a href={l.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              {l.label}
            </Button>
          ))}
        </div>
      )}
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
