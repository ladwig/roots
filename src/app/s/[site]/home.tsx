import Link from "next/link"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Markdown } from "@/components/markdown"
import { Picture } from "@/components/picture"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { imageUrl } from "@/lib/images"
import type { Database } from "@/lib/supabase/types"
import { sitePath } from "@/lib/url"
import { blockAvailable, type Block } from "@/site/blocks"
import { cleanPage } from "@/site/html"
import { renderTemplate } from "@/site/template"
import { outsideIndex } from "@/wiki/outside"

type Ev = { id: string; title: string; slug: string; status: string; starts_at: string; venue_name: string | null; venue_address: string | null; image_path: string | null }
const EV_COLS = "id, title, slug, status, starts_at, venue_name, venue_address, image_path"
type Org = { id: string; name: string; logo_path: string | null }

/** The start page from its blocks (public page and the App's preview of the draft). */
export async function SiteHome({ slug, org, db, tagline, blocks: all, modules, forms, home, legal }: { slug: string; org: Org; db: SupabaseClient<Database>; tagline: string | null; blocks: Block[]; modules: string[]; forms: { slug: string; title: string; intro: string | null }[]; home?: { mode: "blocks" | "html"; html: string | null }; legal?: { imprint: boolean; privacy: boolean } }) {
  const t = await getT()
  if (home?.mode === "html" && home.html) return <HtmlHome slug={slug} org={org} db={db} tagline={tagline} modules={modules} forms={forms} html={home.html} legal={legal} t={t} />
  const blocks = all.filter((b) => b.on && blockAvailable(b.type, modules))
  const now = new Date().toISOString()
  const pinned = blocks.flatMap((b) => (b.type === "event" && b.event_id ? [b.event_id] : []))
  const [upcoming, picked, wiki] = await Promise.all([
    blocks.some((b) => b.type === "events")
      ? db.from("events").select(EV_COLS).eq("org_id", org.id).or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at").limit(50)
      : Promise.resolve({ data: [] as Ev[] }),
    pinned.length ? db.from("events").select(EV_COLS).eq("org_id", org.id).in("id", pinned) : Promise.resolve({ data: [] as Ev[] }),
    blocks.some((b) => b.type === "wiki") ? outsideIndex(org.id, "public") : Promise.resolve([]),
  ])
  const path = (href: string) => (href.startsWith("/") ? sitePath(slug, href) : href)

  return (
    <main className="site-home mx-auto grid max-w-2xl gap-10 px-4 py-12">
      <header className="site-brand flex items-center gap-3">
        <span className="site-logo">
          <Picture path={org.logo_path} name={org.name} size="lg" square />
        </span>
        <div className="grid gap-0.5">
          <h1 className="site-title font-heading text-2xl font-semibold">{org.name}</h1>
          {tagline && <p className="site-tagline text-muted-foreground">{tagline}</p>}
        </div>
      </header>
      {blocks.map((b) => (
        // CSS hooks for own styles: .site-block and .site-block-<type> (hero, text, links, events, event, form, portal, wiki).
        <div key={b.id} className={`site-block site-block-${b.type} grid`}>
        <BlockView b={b} t={t} slug={slug} path={path} upcoming={(upcoming.data ?? []) as Ev[]} picked={(picked.data ?? []) as Ev[]} forms={forms} wiki={wiki} />
        </div>
      ))}
    </main>
  )
}

function BlockView({ b, t, slug, path, upcoming, picked, forms, wiki }: { b: Block; t: T; slug: string; path: (h: string) => string; upcoming: Ev[]; picked: Ev[]; forms: { slug: string; title: string; intro: string | null }[]; wiki: { id: string; title: string }[] }) {
  const heading = (fallback?: string) => (b.title || fallback ? <h2 className="font-heading text-xl font-semibold">{b.title || fallback}</h2> : null)
  switch (b.type) {
    case "hero":
      return (
        <section className="grid gap-3 rounded-xl bg-muted px-6 py-10">
          {b.title && <h2 className="font-heading text-3xl font-semibold text-balance">{b.title}</h2>}
          {b.text && <p className="text-lg whitespace-pre-line text-muted-foreground">{b.text}</p>}
          {b.button_label && b.button_href && (
            <Button size="lg" className="justify-self-start" render={<a href={path(b.button_href)} />} nativeButton={false}>
              {b.button_label}
            </Button>
          )}
        </section>
      )
    case "text":
      return (
        <section className="grid gap-2">
          {heading()}
          <div>
            <Markdown>{b.text ?? ""}</Markdown>
          </div>
        </section>
      )
    case "links":
      return (
        <section className="grid gap-3">
          {heading()}
          <div className="flex flex-wrap gap-2">
            {b.items?.map((l) => (
              <Button key={l.href + l.label} variant="outline" render={<a href={path(l.href)} {...(l.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })} />} nativeButton={false}>
                {l.label}
              </Button>
            ))}
          </div>
        </section>
      )
    case "events": {
      const list = upcoming.slice(0, b.limit ?? 10)
      return (
        <section className="grid gap-3">
          {heading(t("site.upcoming"))}
          {list.length ? (
            <ul className="site-events grid divide-y rounded-lg border">
              {list.map((e) => (
                <li key={e.id} className="site-event">
                  <EventLink e={e} t={t} slug={slug} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("site.noEvents")}</p>
          )}
        </section>
      )
    }
    case "event": {
      const e = picked.find((x) => x.id === b.event_id)
      if (!e) return null
      return (
        <section className="overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL, no optimizer needed yet */}
          {e.image_path && <img src={imageUrl(e.image_path)!} alt="" className="aspect-[2/1] w-full object-cover" />}
          <div className="grid gap-3 p-5">
            <div className="grid gap-1">
              <h2 className="font-heading text-2xl font-semibold">{e.title}</h2>
              <p className="text-muted-foreground">
                {t.date(e.starts_at, { dateStyle: "full", timeStyle: "short" })}
                {e.venue_name && ` · ${e.venue_name}`}
              </p>
            </div>
            {e.status === "cancelled" ? (
              <Badge variant="destructive" className="justify-self-start">{t("site.cancelled")}</Badge>
            ) : (
              <Button size="lg" className="justify-self-start" render={<Link href={sitePath(slug, `/e/${e.slug}`)} />} nativeButton={false}>
                {t("site.toEvent")}
              </Button>
            )}
          </div>
        </section>
      )
    }
    case "form": {
      const f = forms.find((x) => x.slug === b.form_slug)
      if (!f) return null
      return (
        <section className="grid gap-3 rounded-xl border p-5">
          <h2 className="font-heading text-xl font-semibold">{b.title || f.title}</h2>
          {f.intro && <p className="whitespace-pre-line text-muted-foreground">{f.intro}</p>}
          <Button className="justify-self-start" render={<Link href={sitePath(slug, `/f/${f.slug}`)} />} nativeButton={false}>
            {t("site.openForm")}
          </Button>
        </section>
      )
    }
    case "portal":
      return (
        <section className="grid gap-3 rounded-xl border p-5">
          {heading(t("site.portalDefault"))}
          {b.text && <p className="whitespace-pre-line text-muted-foreground">{b.text}</p>}
          <Button variant="outline" className="justify-self-start" render={<Link href={sitePath(slug, "/portal")} />} nativeButton={false}>
            {t("site.toPortal")}
          </Button>
        </section>
      )
    case "wiki":
      if (!wiki.length) return null
      return (
        <section className="grid gap-3">
          {heading(t("site.wikiDefault"))}
          <ul className="grid divide-y rounded-lg border">
            {wiki.map((p) => (
              <li key={p.id}>
                <Link href={sitePath(slug, `/wiki/${p.id}`)} className="block px-4 py-3 font-medium hover:bg-muted">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )
  }
}

function EventLink({ e, t, slug }: { e: Ev; t: T; slug: string }) {
  return (
    <Link href={sitePath(slug, `/e/${e.slug}`)} className="grid gap-0.5 px-4 py-3 hover:bg-muted">
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {e.title}
        {e.status === "cancelled" && <Badge variant="destructive">{t("site.cancelled")}</Badge>}
      </span>
      <span className="text-sm text-muted-foreground">
        {t.date(e.starts_at, { dateStyle: "full", timeStyle: "short" })}
        {e.venue_name && ` · ${e.venue_name}`}
      </span>
    </Link>
  )
}

/** The start page from the org's own HTML template, filled with live data (src/site/template.ts), cleaned again. */
async function HtmlHome({ slug, org, db, tagline, modules, forms, html, legal, t }: { slug: string; org: Org; db: SupabaseClient<Database>; tagline: string | null; modules: string[]; forms: { slug: string; title: string; intro: string | null }[]; html: string; legal?: { imprint: boolean; privacy: boolean }; t: T }) {
  const on = new Set(modules)
  const now = new Date().toISOString()
  const [{ data: evs }, wiki] = await Promise.all([
    on.has("events") && /\{\{[#^]?\s*(events|next)/.test(html)
      ? db.from("events").select(EV_COLS).eq("org_id", org.id).or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at").limit(50)
      : Promise.resolve({ data: [] as Ev[] }),
    on.has("wiki") && html.includes("wiki") ? outsideIndex(org.id, "public") : Promise.resolve([]),
  ])
  const events = ((evs ?? []) as Ev[]).map((e) => ({
    title: e.title,
    date: t.date(e.starts_at, { dateStyle: "full" }),
    date_short: t.date(e.starts_at, { dateStyle: "medium" }),
    time: t.date(e.starts_at, { timeStyle: "short" }),
    weekday: t.date(e.starts_at, { weekday: "long" }),
    day: t.date(e.starts_at, { day: "numeric" }),
    month: t.date(e.starts_at, { month: "short" }),
    venue: e.venue_name ?? "",
    address: e.venue_address ?? "",
    image: e.image_path ? `/i/${e.image_path}` : "",
    url: sitePath(slug, `/e/${e.slug}`),
    cancelled: e.status === "cancelled",
  }))
  const data = {
    org: { name: org.name, tagline: tagline ?? "", logo: org.logo_path ? `/i/${org.logo_path}` : "", url: sitePath(slug, "/") },
    events,
    next: events[0] ?? null,
    forms: forms.map((f) => ({ title: f.title, intro: f.intro ?? "", url: sitePath(slug, `/f/${f.slug}`) })),
    form: Object.fromEntries(forms.map((f) => [f.slug, { title: f.title, url: sitePath(slug, `/f/${f.slug}`) }])),
    portal: on.has("members") ? { url: sitePath(slug, "/portal") } : null,
    wiki: wiki.map((p) => ({ title: p.title, url: sitePath(slug, `/wiki/${p.id}`) })),
    imprint_url: legal?.imprint ? sitePath(slug, "/impressum") : "",
    privacy_url: legal?.privacy ? sitePath(slug, "/datenschutz") : "",
  }
  return <div className="site-page" dangerouslySetInnerHTML={{ __html: cleanPage(renderTemplate(html, data)) }} />
}
