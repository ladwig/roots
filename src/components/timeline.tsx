import Link from "next/link"
import type { T } from "@/i18n/translate"
import { cn } from "@/lib/utils"

export type TimelineItem = { id: string; title: string; start: string | null; end: string | null; color: string; href: string; done?: boolean; group?: string; detail?: string }

const DAY = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (n: number) => new Date(n).toISOString().slice(0, 10)

/**
 * Timeline (Gantt light): one row per item, a bar from start to end (one date only = a one-day bar), grouped by `group`,
 * today marked. Days are the columns; the range covers all items plus a little air, at least four weeks. Items without
 * dates are listed below. Server-rendered, scrolls sideways on small screens; bars link to the item.
 * ponytail: no dragging bars; dates are changed in the item itself. Add drag when people ask for it.
 */
export function Timeline({ t, items, today, empty }: { t: T; items: TimelineItem[]; today: string; empty: string }) {
  const dated = items
    .map((i) => {
      const a = i.start ?? i.end
      const b = i.end ?? i.start
      return a && b ? { ...i, from: Math.min(ms(a), ms(b)), to: Math.max(ms(a), ms(b)) } : null
    })
    .filter((x) => x !== null)
  const undated = items.filter((i) => !i.start && !i.end)
  if (!dated.length && !undated.length) return <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>

  const now = ms(today)
  // Range: Monday before the earliest date (or today) … at least 4 weeks later, 3 days of air at the end.
  let first = Math.min(now, ...dated.map((d) => d.from))
  first -= ((new Date(first).getUTCDay() + 6) % 7) * DAY
  const last = Math.max(first + 27 * DAY, now, ...dated.map((d) => d.to)) + 3 * DAY
  const days = Math.round((last - first) / DAY) + 1
  const pct = (n: number) => `${((n - first) / DAY / days) * 100}%`
  const width = `max(100%, ${days * 1.75}rem)`
  const months = Array.from({ length: days }, (_, i) => first + i * DAY).filter((d, i) => i === 0 || new Date(d).getUTCDate() === 1)
  const mondays = Array.from({ length: days }, (_, i) => first + i * DAY).filter((d) => new Date(d).getUTCDay() === 1)
  const groups = [...new Set(dated.map((d) => d.group ?? ""))]

  return (
    <div className="grid gap-4">
      {dated.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <div className="relative" style={{ width }}>
            {/* week lines + today */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {mondays.map((d) => (
                <span key={d} className="absolute inset-y-0 border-l border-border/60" style={{ left: pct(d) }} />
              ))}
              {now >= first && now <= last && <span className="absolute inset-y-0 border-l-2 border-primary" style={{ left: pct(now + DAY / 2) }} />}
            </div>
            <div className="relative h-12 border-b bg-muted/40 text-xs text-muted-foreground">
              {months.map((d) => (
                <span key={`m${d}`} className="absolute top-1 pl-1.5 font-medium text-foreground" style={{ left: pct(d) }}>
                  {t.date(iso(d), { month: "long", year: "numeric" })}
                </span>
              ))}
              {mondays.map((d) => (
                <span key={`w${d}`} className="absolute bottom-1 pl-1.5" style={{ left: pct(d) }}>
                  {new Date(d).getUTCDate()}.
                </span>
              ))}
            </div>
            {groups.map((g) => (
              <div key={g || "all"}>
                {g && <div className="sticky left-0 border-b bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">{g}</div>}
                {dated
                  .filter((d) => (d.group ?? "") === g)
                  .sort((a, b) => a.from - b.from)
                  .map((d) => (
                    <div key={d.id} className="relative h-10 border-b last:border-b-0">
                      <Link
                        href={d.href}
                        scroll={false}
                        title={`${d.title} · ${t.date(iso(d.from), { dateStyle: "medium" })}${d.to > d.from ? ` – ${t.date(iso(d.to), { dateStyle: "medium" })}` : ""}`}
                        className={cn("absolute top-1.5 flex h-7 min-w-7 items-center overflow-hidden rounded-md border-l-4 px-2 text-xs font-medium whitespace-nowrap text-foreground hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", d.done && "opacity-50")}
                        style={{ left: pct(d.from), width: `calc(${((d.to - d.from) / DAY + 1) / days} * 100%)`, borderColor: d.color, background: `color-mix(in oklch, ${d.color} 22%, var(--background))` }}
                      >
                        <span className="truncate">{d.done ? `✓ ${d.title}` : d.title}</span>
                      </Link>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {undated.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("timeline.undated")}</h3>
          <ul className="flex flex-wrap gap-2">
            {undated.map((i) => (
              <li key={i.id}>
                <Link href={i.href} scroll={false} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-muted">
                  <span className="size-2 rounded-full" style={{ background: i.color }} aria-hidden />
                  {i.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
