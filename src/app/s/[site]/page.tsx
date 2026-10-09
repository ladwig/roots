// Public surface (<org>.ROOT_DOMAIN, rewritten here by proxy.ts). Only published data belongs here.
// ponytail: plain list until the Public sites module; public pages will use the org's language, not the visitor cookie.
import Link from "next/link"
import { notFound } from "next/navigation"
import { Picture } from "@/components/picture"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getSite } from "./data"

export default async function PublicSite({ params }: PageProps<"/s/[site]">) {
  const { site } = await params
  const s = await getSite(site)
  if (!s) notFound()
  const t = await getT()
  const now = new Date().toISOString()
  const { data: events } = await s.db
    .from("events")
    .select("id, title, slug, status, starts_at, venue_name")
    .eq("org_id", s.org.id)
    .or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`)
    .order("starts_at")
    .limit(100)

  return (
    <main className="mx-auto grid max-w-2xl gap-8 px-4 py-12">
      <header className="flex items-center gap-3">
        <Picture path={s.org.logo_path} name={s.org.name} size="lg" square />
        <h1 className="font-heading text-2xl font-semibold">{s.org.name}</h1>
      </header>
      <section className="grid gap-3">
        <h2 className="font-medium">{t("site.upcoming")}</h2>
        {events?.length ? (
          <ul className="grid divide-y rounded-lg border">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/e/${e.slug}`} className="grid gap-0.5 px-4 py-3 hover:bg-muted">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {e.title}
                    {e.status === "cancelled" && <Badge variant="destructive">{t("site.cancelled")}</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.date(e.starts_at, { dateStyle: "full", timeStyle: "short" })}
                    {e.venue_name && ` · ${e.venue_name}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("site.noEvents")}</p>
        )}
      </section>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
