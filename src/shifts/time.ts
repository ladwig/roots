// Time tracking rules (pure, tested in time.test.mjs). German working-time law as warnings only, never blocking:
// - breaks (ArbZG §4): more than 6 h → 30 min, more than 9 h → 45 min
// - max. 10 h work per day (§3)
// - min. 11 h rest between two working days (§5)
// - an entry still open after 16 h is probably a forgotten check-out
// ponytail: no exceptions per industry (hospitality may shorten rest to 10 h), Sunday/holiday rules or youth rules.
export type Entry = { id: string; started_at: string; ended_at: string | null; break_minutes: number | null }
export type Warning = "break_short" | "day_over_10h" | "rest_short" | "still_open"

const MIN = 60_000
export const legalBreak = (grossMinutes: number) => (grossMinutes > 9 * 60 ? 45 : grossMinutes > 6 * 60 ? 30 : 0)

/** Gross (presence), break used (manual or automatic) and net minutes. Open entries count until `now`. */
export function minutes(e: Entry, now = Date.now()) {
  const gross = Math.max(0, Math.round(((e.ended_at ? new Date(e.ended_at).getTime() : now) - new Date(e.started_at).getTime()) / MIN))
  const brk = Math.min(gross, e.break_minutes ?? legalBreak(gross))
  return { gross, break: brk, net: gross - brk, auto: e.break_minutes == null }
}

const berlinDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

/** Warnings per entry id, for one person's entries (any order). */
export function warnings(entries: Entry[], now = Date.now()): Map<string, Warning[]> {
  const out = new Map<string, Warning[]>()
  const add = (id: string, w: Warning) => out.set(id, [...(out.get(id) ?? []), w])
  const sorted = [...entries].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const perDay = new Map<string, { net: number; ids: string[] }>()
  sorted.forEach((e, i) => {
    const m = minutes(e, now)
    if (e.break_minutes != null && e.break_minutes < legalBreak(m.gross)) add(e.id, "break_short")
    if (!e.ended_at && now - new Date(e.started_at).getTime() > 16 * 60 * MIN) add(e.id, "still_open")
    const d = perDay.get(berlinDay(e.started_at)) ?? { net: 0, ids: [] }
    if (e.ended_at) perDay.set(berlinDay(e.started_at), { net: d.net + m.net, ids: [...d.ids, e.id] }) // open ones aren't finished days
    const prev = sorted[i - 1]
    if (prev?.ended_at && berlinDay(prev.started_at) !== berlinDay(e.started_at)) {
      const rest = (new Date(e.started_at).getTime() - new Date(prev.ended_at).getTime()) / MIN
      if (rest >= 0 && rest < 11 * 60) add(e.id, "rest_short")
    }
  })
  for (const d of perDay.values()) if (d.net > 10 * 60) d.ids.forEach((id) => add(id, "day_over_10h"))
  return out
}

/** Input check shared by the App and the API (message key, or null when fine). Future starts are allowed (planning). */
export function entryProblem(e: { started_at: string; ended_at: string | null; break_minutes: number | null }) {
  const start = new Date(e.started_at).getTime()
  if (Number.isNaN(start)) return "errors.invalid_input"
  if (!e.ended_at) return null
  const gross = (new Date(e.ended_at).getTime() - start) / MIN
  if (!(gross > 0)) return "time.endBeforeStart"
  if (gross > 24 * 60) return "time.tooLong"
  if (e.break_minutes != null && e.break_minutes >= gross) return "time.breakTooLong"
  return null
}
