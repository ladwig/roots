"use client"

import { useEffect, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import type { DoorStats as Stats } from "@/tickets/door"
import { doorStatsAction } from "./actions"

// Door stats bar (every tab): checked in / expected, still to come, still sellable; tap for the rows per ticket type,
// guest list, members. Refreshes every 20 s and on "door:changed" (scanner, sale, list check-ins dispatch it); an
// offline check-in dispatches { offline: true } and is counted on the device until the next refresh.
export const doorChanged = (offline = false) => window.dispatchEvent(new CustomEvent("door:changed", { detail: { offline } }))

export function DoorStats({ eventId, initial }: { eventId: string; initial: Stats | null }) {
  const t = useT()
  const [s, setS] = useState(initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const load = () => navigator.onLine && doorStatsAction(eventId).then((x) => x && setS(x)).catch(() => null)
    const changed = (e: Event) => {
      if ((e as CustomEvent<{ offline?: boolean }>).detail?.offline) setS((x) => x && { ...x, checkedIn: x.checkedIn + 1 })
      else load()
    }
    window.addEventListener("door:changed", changed)
    window.addEventListener("online", load)
    const timer = setInterval(load, 20_000)
    return () => {
      window.removeEventListener("door:changed", changed)
      window.removeEventListener("online", load)
      clearInterval(timer)
    }
  }, [eventId])

  if (!s) return null
  const open_ = Math.max(0, s.expected - s.checkedIn)
  const pct = s.expected ? Math.min(100, Math.round((s.checkedIn / s.expected) * 100)) : 0
  const low = s.sellable !== null && s.sellable < 10
  const name = (r: Stats["rows"][number]) => (r.kind === "shop" ? r.name : t.dynamic(`door.stats.${r.kind}`))

  return (
    <div className="rounded-xl border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="grid w-full gap-2 p-3 text-left">
        <div className="flex items-end gap-4">
          <Num label={t("door.stats.checkedIn")} value={`${s.checkedIn} / ${s.expected}`} big />
          <Num label={t("door.stats.open")} value={String(open_)} />
          <Num label={t("door.stats.sellable")} value={s.sellable === null ? "∞" : s.sellable === 0 ? t("door.stats.soldOut") : String(s.sellable)} warn={low} />
          <ChevronDownIcon className={cn("mb-1 ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("door.stats.checkedIn")}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </button>
      {open && (
        <table className="w-full border-t text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-normal" />
              <th className="px-3 py-2 text-right font-normal">{t("door.stats.inOfExpected")}</th>
              <th className="px-3 py-2 text-right font-normal">{t("door.stats.left")}</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-3 py-2">{name(r)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.checkedIn}
                  {r.expected !== null && ` / ${r.expected}`}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.left !== null && r.left < 10 && "font-medium text-destructive")}>
                  {r.kind !== "shop" ? "–" : r.left === null ? "∞" : r.left}
                </td>
              </tr>
            ))}
            {s.doorIn > 0 && (
              <tr className="border-t text-muted-foreground">
                <td className="px-3 py-2">{t("door.stats.atDoor")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.doorIn}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Num({ label, value, big, warn }: { label: string; value: string; big?: boolean; warn?: boolean }) {
  return (
    <div className="grid min-w-0">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", big ? "text-2xl" : "text-lg", warn && "text-destructive")}>{value}</span>
    </div>
  )
}
