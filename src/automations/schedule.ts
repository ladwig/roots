// Schedules (pure, tested in schedule.test.mjs): when a "schedule" trigger runs next, which records a date filter
// matches today, and relative dates in action values ("today+10"). All in Berlin time.
import { fromLocalInput } from "../lib/time.ts"

export type Schedule = { every: "day" | "week" | "month"; time: string; weekday?: number; monthday?: number }
const DAY = 86_400_000
export const berlinDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1

/** The first time after `after` the schedule fires (Berlin local time, DST-safe). */
export function nextRun(s: Schedule, after: Date): Date {
  const time = /^\d{2}:\d{2}$/.test(s.time) ? s.time : "09:00"
  let day = berlinDay(after)
  for (let i = 0; i < 400; i++, day = addDays(day, 1)) {
    if (s.every === "week" && isoWeekday(day) !== (s.weekday ?? 1)) continue
    if (s.every === "month" && Number(day.slice(8)) !== Math.min(s.monthday ?? 1, 28)) continue
    const at = fromLocalInput(`${day}T${time}`)!
    if (at > after) return at
  }
  return new Date(after.getTime() + DAY)
}

/** Does a date value fall on today + offset days? yearly = same month/day (birthdays, anniversaries). */
export function dateMatches(value: unknown, offset: number, yearly: boolean, today: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false
  const target = addDays(today, -offset) // value + offset = today
  const day = value.length > 10 ? berlinDay(new Date(value)) : value.slice(0, 10)
  return yearly ? day.slice(5) === target.slice(5) : day === target
}

/**
 * Date arithmetic for values: "today", "today+10", "today-1y", "2026-12-31+6m" (a date placeholder like
 * {membership.ends_on} is filled in before) → YYYY-MM-DD. Units d (default), w, m, y; months clamp to the month's
 * end (31 Jan + 1m = 28/29 Feb). Anything else comes back unchanged.
 */
export function resolveDate(raw: string, today: string) {
  const m = /^\s*(today|heute|\d{4}-\d{2}-\d{2})(?:T[^\s+-]*(?:[+-]\d{2}:?\d{2})?)?\s*(?:([+-])\s*(\d{1,4})\s*([dwmy])?)?\s*$/i.exec(raw)
  if (!m) return raw
  const base = /^\d/.test(m[1]) ? m[1] : today
  const n = (m[2] === "-" ? -1 : 1) * Number(m[3] ?? 0)
  const unit = (m[4] ?? "d").toLowerCase()
  if (unit === "d" || unit === "w") return addDays(base, n * (unit === "w" ? 7 : 1))
  const [y, mo, d] = base.split("-").map(Number)
  const months = y * 12 + (mo - 1) + n * (unit === "y" ? 12 : 1)
  const ny = Math.floor(months / 12)
  const nm = (months % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`
}
