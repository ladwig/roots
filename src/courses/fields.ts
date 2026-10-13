// Courses: input parsing shared by the App forms and the API, plus small calculations (pure; relative imports so
// node --test can load it). `get(key)` returns the raw string ("" = empty).
import { fromLocalInput } from "../lib/time.ts"
import { occurrences, type Series } from "../shifts/series.ts"

type Get = (key: string) => string
type Result<R> = { row: R } | { error: string; field?: string }
const UUID = /^[0-9a-f-]{36}$/
const text = (get: Get, k: string, max: number) => get(k).trim().slice(0, max) || null
export const MAX_SERIES_SESSIONS = 200

export function readCourse(get: Get): Result<{ title: string; description: string | null; instructor: string | null; location_id: string | null; capacity: number | null; track_attendance: boolean }> {
  const title = text(get, "title", 200)
  if (!title) return { error: "courses.titleMissing", field: "title" }
  const cap = get("capacity").trim()
  const capacity = cap ? Number(cap) : null
  if (capacity != null && !(Number.isInteger(capacity) && capacity >= 1 && capacity <= 10000)) return { error: "courses.capacityInvalid", field: "capacity" }
  const track = get("track_attendance")
  return {
    row: {
      title,
      description: text(get, "description", 5000),
      instructor: text(get, "instructor", 200),
      location_id: UUID.test(get("location_id")) ? get("location_id") : null,
      capacity,
      track_attendance: track === "" ? false : track !== "0" && track !== "false",
    },
  }
}

/** One date: `starts_at` / `ends_at` as datetime-local (Berlin) or ISO. */
export function readSession(get: Get): Result<{ starts_at: string; ends_at: string; note: string | null; cancelled: boolean }> {
  const at = (k: string) => (/[zZ]|[+-]\d{2}:\d{2}$/.test(get(k)) ? new Date(get(k)) : fromLocalInput(get(k)))
  const start = at("starts_at")
  const end = at("ends_at")
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "errors.invalid_input", field: "starts_at" }
  if (end <= start) return { error: "courses.endBeforeStart", field: "ends_at" }
  const c = get("cancelled")
  return { row: { starts_at: start.toISOString(), ends_at: end.toISOString(), note: text(get, "note", 500), cancelled: c === "1" || c === "on" || c === "true" } }
}

/** Weekly dates: weekdays (1 = Mon … 7 = Sun), every N weeks, from–to dates, start/end time (Berlin). */
export function readSeries(get: Get, weekdays: string[]): Result<{ dates: { starts_at: string; ends_at: string }[] }> {
  const s: Series = {
    weekdays: [...new Set(weekdays.map(Number))].filter((d) => d >= 1 && d <= 7),
    every_weeks: Math.max(1, Math.min(8, Math.floor(Number(get("every_weeks")) || 1))),
    start_date: get("from"),
    end_date: get("to"),
    start_time: get("start_time"),
    end_time: get("end_time"),
  }
  if (!s.weekdays.length) return { error: "courses.pickWeekday", field: "weekdays" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(s.end_date ?? "") || s.end_date! < s.start_date) return { error: "courses.rangeInvalid", field: "from" }
  if (!/^\d{2}:\d{2}$/.test(s.start_time) || !/^\d{2}:\d{2}$/.test(s.end_time)) return { error: "errors.invalid_input", field: "start_time" }
  const dates = occurrences(s, s.start_date, s.end_date!).map(({ starts_at, ends_at }) => ({ starts_at, ends_at }))
  if (!dates.length) return { error: "courses.seriesEmpty", field: "weekdays" }
  if (dates.length > MAX_SERIES_SESSIONS) return { error: "courses.tooManyDates", field: "to" }
  return { row: { dates } }
}

/** Attendance rate of a participant over the sessions that took place (not cancelled, already started). */
export function attendanceRate(present: number, held: number) {
  return held ? Math.round((present / held) * 100) : null
}
