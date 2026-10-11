// Recurring shifts: which dates a series produces in a window, as real timestamps (Berlin time, DST-safe).
import { fromLocalInput } from "../lib/time.ts"

export type Series = { weekdays: number[]; every_weeks: number; start_date: string; end_date: string | null; start_time: string; end_time: string }

const day = (d: string) => new Date(`${d}T12:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const isoWeekday = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1 // 1 = Mon … 7 = Sun

/** Occurrences from `from` to `to` (YYYY-MM-DD, inclusive). End before start time = ends the next day. */
export function occurrences(s: Series, from: string, to: string) {
  const out: { date: string; starts_at: string; ends_at: string }[] = []
  const first = day(s.start_date)
  const weekStart = new Date(first.getTime() - (isoWeekday(first) - 1) * 86_400_000) // Monday of the start week
  const last = s.end_date && s.end_date < to ? s.end_date : to
  for (let d = day(from > s.start_date ? from : s.start_date); iso(d) <= last; d = new Date(d.getTime() + 86_400_000)) {
    const weeks = Math.floor((d.getTime() - weekStart.getTime()) / (7 * 86_400_000))
    if (weeks % s.every_weeks !== 0 || !s.weekdays.includes(isoWeekday(d))) continue
    const date = iso(d)
    const start = fromLocalInput(`${date}T${s.start_time.slice(0, 5)}`)!
    const endDate = s.end_time <= s.start_time ? iso(new Date(d.getTime() + 86_400_000)) : date
    const end = fromLocalInput(`${endDate}T${s.end_time.slice(0, 5)}`)!
    out.push({ date, starts_at: start.toISOString(), ends_at: end.toISOString() })
  }
  return out
}

/** Worked minutes of an assignment: from check-in to check-out (or the planned end if not checked out). */
export const workedMinutes = (a: { checked_in_at: string | null; checked_out_at: string | null }, shiftEnd: string) =>
  a.checked_in_at ? Math.max(0, Math.round((new Date(a.checked_out_at ?? shiftEnd).getTime() - new Date(a.checked_in_at).getTime()) / 60_000)) : 0
