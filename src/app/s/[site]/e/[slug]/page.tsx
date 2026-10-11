import Link from "next/link"
import { param, sitePath } from "@/lib/url"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { imageUrl } from "@/lib/images"
import { createPublicClient } from "@/lib/supabase/server"
import { getSite } from "../../data"
import { TicketShop } from "./shop"

export default async function PublicEvent({ params, searchParams }: PageProps<"/s/[site]/e/[slug]">) {
  const { site, slug } = await params
  const code = param(await searchParams, "code")?.trim().toUpperCase().slice(0, 40) || null
  const s = await getSite(site)
  if (!s) notFound()
  const { data: e } = await s.db
    .from("events")
    .select("id, title, status, starts_at, ends_at, venue_name, venue_address, description, image_path, max_tickets_per_order")
    .eq("org_id", s.org.id)
    .eq("slug", slug)
    .maybeSingle()
  if (!e) notFound()
  const t = await getT()
  const sameDay = e.ends_at && new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() < 86_400_000

  return (
    <main className="mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <Link href={sitePath(site)} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {s.org.name} · {t("site.back")}
      </Link>
      {e.image_path && (
        // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, no optimizer needed yet
        <img src={imageUrl(e.image_path)} alt="" className="aspect-video w-full rounded-xl border object-cover" />
      )}
      <header className="grid gap-2">
        {e.status === "cancelled" && <Badge variant="destructive">{t("site.cancelled")}</Badge>}
        <h1 className="font-heading text-3xl font-semibold">{e.title}</h1>
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
      {e.status === "published" && <TicketShop site={site} slug={slug} eventId={e.id} max={e.max_tickets_per_order} code={code} />}
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false

// Public timetable (only slots marked public; times in Berlin time).
async function Timetable({ eventId }: { eventId: string }) {
  const db = createPublicClient()
  const { data: slots } = await db.from("event_slots").select("id, title, stage, starts_at, ends_at, artists(name)").eq("event_id", eventId).order("starts_at")
  if (!slots?.length) return null
  const t = await getT()
  const stages = [...new Set(slots.map((s) => s.stage ?? ""))]
  return (
    <section aria-labelledby="timetable" className="grid gap-3">
      <h2 id="timetable" className="font-heading text-xl font-semibold">
        {t("lineup.timetable")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {stages.map((stage) => (
          <div key={stage} className="grid gap-1">
            {stage && <h3 className="text-sm font-medium text-muted-foreground">{stage}</h3>}
            <ol className="grid gap-1">
              {slots
                .filter((s) => (s.stage ?? "") === stage)
                .map((s) => (
                  <li key={s.id} className="flex gap-3 text-sm">
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                      {t.date(s.starts_at, { hour: "2-digit", minute: "2-digit" })}
                      {s.ends_at && `–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                    <span className="font-medium">{s.artists?.name ?? s.title}</span>
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
