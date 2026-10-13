// Wall-clock times for <input type="datetime-local"> ↔ UTC instants, in the org's time zone.
// ponytail: one zone for everyone (German market); make it an org setting when the first non-German org shows up.
export const TIME_ZONE = "Europe/Berlin"

// UTC offset (ms) of `zone` at instant `date`.
function offset(date: Date, zone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  )
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - (date.getTime() - date.getMilliseconds())
}

// "2026-10-20T19:30" (Berlin) → Date. Invalid input → null.
export function fromLocalInput(value: string, zone = TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // two passes settle DST transitions
  let utc = naive - offset(new Date(naive), zone)
  utc = naive - offset(new Date(utc), zone)
  return new Date(utc)
}

// Date / ISO string → "2026-10-20T19:30" in `zone`.
export function toLocalInput(value: string | Date, zone = TIME_ZONE) {
  const d = new Date(value)
  return new Date(d.getTime() + offset(d, zone)).toISOString().slice(0, 16)
}

/** "2026-10" → the month's bounds (Berlin time) and its neighbours; invalid/missing → this month. */
export function monthOf(value?: string) {
  const month = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
  return { month, next, prev, from: fromLocalInput(`${month}-01T00:00`)!.toISOString(), to: fromLocalInput(`${next}-01T00:00`)!.toISOString() }
}
