// Public surface (<org>.ROOT_DOMAIN, an own domain, or /s/<org>): the org's start page, built from the blocks set in
// Settings → Website (src/site/blocks.ts). Without a saved site: the upcoming events, as before. Only published data.
// ponytail: public pages will use the org's language, not the visitor cookie.
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Markdown } from "@/components/markdown"
import { Picture } from "@/components/picture"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { imageUrl } from "@/lib/images"
import { cachedSite } from "@/lib/public-cache"
import { sitePath } from "@/lib/url"
import { blockAvailable, DEFAULT_BLOCKS, readBlocks, type Block } from "@/site/blocks"
import { outsideIndex } from "@/wiki/outside"
import { getSite } from "./data"

type Ev = { id: string; title: string; slug: string; status: string; starts_at: string; venue_name: string | null; image_path: string | null }
const EV_COLS = "id, title, slug, status, starts_at, venue_name, image_path"

export async function generateMetadata({ params }: PageProps<"/s/[site]">): Promise<Metadata> {
  const s = await getSite((await params).site)
  if (!s) return {}
  const site = await cachedSite(s.org.id)
  const image = imageUrl(s.org.logo_path)
  return {
    title: { absolute: s.org.name },
    description: site?.tagline ?? undefined,
    openGraph: { title: s.org.name, description: site?.tagline ?? undefined, images: image ? [image] : undefined },
  }
}

export default async function PublicSite({ params }: PageProps<"/s/[site]">) {
  const { site: slug } = await params
  const s = await getSite(slug)
  if (!s) notFound()
  const [t, site] = await Promise.all([getT(), cachedSite(s.org.id)])
  const blocks = (site?.saved ? readBlocks(site.blocks) : DEFAULT_BLOCKS).filter((b) => b.on && blockAvailable(b.type, site?.modules ?? []))
  const now = new Date().toISOString()
  const pinned = blocks.flatMap((b) => (b.type === "event" && b.event_id ? [b.event_id] : []))
  const [upcoming, picked, wiki] = await Promise.all([
    blocks.some((b) => b.type === "events")
      ? s.db.from("events").select(EV_COLS).eq("org_id", s.org.id).or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at").limit(50)
      : Promise.resolve({ data: [] as Ev[] }),
    pinned.length ? s.db.from("events").select(EV_COLS).eq("org_id", s.org.id).in("id", pinned) : Promise.resolve({ data: [] as Ev[] }),
    blocks.some((b) => b.type === "wiki") ? outsideIndex(s.org.id, "public") : Promise.resolve([]),
  ])
  const path = (href: string) => (href.startsWith("/") ? sitePath(slug, href) : href)

  return (
    <main className="mx-auto grid max-w-2xl gap-10 px-4 py-12">
      <header className="flex items-center gap-3">
        <Picture path={s.org.logo_path} name={s.org.name} size="lg" square />
        <div className="grid gap-0.5">
          <h1 className="font-heading text-2xl font-semibold">{s.org.name}</h1>
          {site?.tagline && <p className="text-muted-foreground">{site.tagline}</p>}
        </div>
      </header>
      {blocks.map((b) => (
        <BlockView key={b.id} b={b} t={t} slug={slug} path={path} upcoming={(upcoming.data ?? []) as Ev[]} picked={(picked.data ?? []) as Ev[]} forms={site?.forms ?? []} wiki={wiki} />
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
            <ul className="grid divide-y rounded-lg border">
              {list.map((e) => (
                <li key={e.id}>
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

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
