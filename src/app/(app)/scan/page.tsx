import Link from "next/link"
import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { Scanner } from "./scanner"

// Door scanner: pick an event (today's first), then scan.
export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const ctx = await requirePerm("tickets.scan")
  if (!ctx.modules.has("tickets")) notFound()
  const t = await getT()
  const sp = await searchParams
  const now = new Date().getTime()
  const since = new Date(now - 12 * 3600_000).toISOString()
  const { data: events } = await ctx.supabase
    .from("events")
    .select("id, title, starts_at")
    .eq("org_id", ctx.org.id)
    .eq("status", "published")
    .gte("starts_at", new Date(now - 7 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(20)
  const current = events?.find((e) => e.id === param(sp, "event")) ?? events?.find((e) => e.starts_at >= since)
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("tickets.scanTitle")}</h1>
      {!events?.length ? (
        <p className="text-sm text-muted-foreground">{t("tickets.noEventsToScan")}</p>
      ) : (
        <nav aria-label={t("tickets.pickEvent")} className="flex flex-wrap gap-1.5">
          {events.map((e) => (
            <Link
              key={e.id}
              href={`/scan?event=${e.id}`}
              aria-current={e.id === current?.id ? "true" : undefined}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
            >
              {e.title} · {t.date(e.starts_at, { dateStyle: "short" })}
            </Link>
          ))}
        </nav>
      )}
      {current && <Scanner key={current.id} eventId={current.id} />}
    </div>
  )
}

export const instant = false
