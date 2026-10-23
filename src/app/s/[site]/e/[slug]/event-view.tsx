import parse, { type DOMNode, Element } from "html-react-parser"
import { getT } from "@/i18n/server"
import { cachedEvent } from "@/lib/public-cache"
import { createPublicClient } from "@/lib/supabase/server"
import { sitePath } from "@/lib/url"
import { cleanPage } from "@/site/html"
import { placeSlots, renderTemplate, slotMarkers } from "@/site/template"

type Ev = NonNullable<Awaited<ReturnType<typeof cachedEvent>>>

/**
 * The event page from the org's template (Website → Seiten → Eventseite): its HTML with the event's data, and roots'
 * own blocks where it says {{tickets}} / {{timetable}} ({{tickets}} is added at the end if missing).
 */
export async function TemplatedEvent({ site, org, e, template, shop, t }: { site: string; org: { name: string; logo_path: string | null }; e: Ev; template: string; shop: React.ReactNode; t: Awaited<ReturnType<typeof getT>> }) {
  const sameDay = e.ends_at && new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() < 86_400_000
  const data = {
    event: {
      title: e.title,
      date: t.date(e.starts_at, { dateStyle: "full" }),
      time: t.date(e.starts_at, { timeStyle: "short" }),
      end: e.ends_at ? (sameDay ? t.date(e.ends_at, { timeStyle: "short" }) : t.date(e.ends_at, { dateStyle: "full", timeStyle: "short" })) : "",
      venue: e.venue_name ?? "",
      address: e.venue_address ?? "",
      image: e.image_path ? `/i/${e.image_path}` : "",
      description: e.description ?? "",
      cancelled: e.status === "cancelled",
    },
    org: { name: org.name, logo: org.logo_path ? `/i/${org.logo_path}` : "", url: sitePath(site, "/") },
    ...slotMarkers(),
  }
  // The cleaned HTML as a component tree, with roots' blocks in their place (nesting intact).
  const html = placeSlots(cleanPage(renderTemplate(template, data)), ["tickets"])
  return (
    <div className="site-page">
      {parse(html, {
        replace(node: DOMNode) {
          if (!(node instanceof Element) || node.name !== "roots-slot") return
          return node.attribs.name === "tickets" ? <div className="w-full">{shop}</div> : <Timetable eventId={e.id} />
        },
      })}
    </div>
  )
}

// Public timetable (only slots marked public; times in Berlin time).
export async function Timetable({ eventId }: { eventId: string }) {
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
