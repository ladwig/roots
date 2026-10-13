// Event fields: the rules the App form and the API share, plus the insert with its automatic address.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, TablesInsert } from "@/lib/supabase/types"
import { slugify } from "./slug"

export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const
export const TICKET_NAMES = ["off", "optional", "required"] as const
export const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/

type EventFields = { title: string | null; starts_at: string; ends_at: string | null; capacity: number | null }

/** Returns an errors.* key, or null when the event is valid. Times are ISO strings. */
export function checkEvent(e: EventFields, slug?: string | null) {
  if (!e.title || e.title.length > 200) return "errors.invalid_input"
  if (e.ends_at && Date.parse(e.ends_at) <= Date.parse(e.starts_at)) return "errors.end_before_start"
  if (e.capacity !== null && !(Number.isInteger(e.capacity) && e.capacity > 0)) return "errors.invalid_input"
  if (slug && !EVENT_SLUG.test(slug)) return "errors.invalid_input"
  return null
}

/** Insert an event. Without a slug the title gives one; if that's taken (same title), a short suffix is added once. */
export async function insertEvent(db: SupabaseClient<Database>, row: Omit<TablesInsert<"events">, "slug">, slug: string | null) {
  const insert = (s: string) => db.from("events").insert({ ...row, slug: s }).select("*").single()
  let res = await insert(slug ?? slugify(row.title))
  if (res.error?.code === "23505" && !slug) res = await insert(`${slugify(row.title).slice(0, 74)}-${crypto.randomUUID().slice(0, 4)}`)
  return res
}
