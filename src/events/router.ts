// Routes each new event once to the *people* who should hear about it (org destinations are fanned out by
// emit_event already): audience from the registry, minus the person who caused it, filtered by preferences.
// In-app = a notifications row; other channels = queued deliveries the worker sends with retries.
import { createAdminClient } from "@/lib/supabase/admin"
import { emailConfigured } from "./channels/email"
import { getEventType, personChannels, type PersonChannel } from "./registry"

export async function routeEvents(limit = 50) {
  const db = createAdminClient()
  const { data: ids, error } = await db.rpc("claim_unrouted_events", { p_limit: limit })
  if (error) throw error
  if (!ids?.length) return 0
  const { data: events } = await db.from("events").select("id, org_id, type, actor_id").in("id", ids)

  for (const event of events ?? []) {
    const audience = getEventType(event.type)?.audience
    if (!audience) continue
    let people: string[] = []
    if (audience.platform) people = ((await db.from("platform_admins").select("user_id")).data ?? []).map((r) => r.user_id)
    else if (event.org_id && audience.permission)
      people = (await db.rpc("members_with_perm", { p_org: event.org_id, p_perm: audience.permission })).data ?? []
    people = [...new Set(people)].filter((id) => id !== event.actor_id)
    if (!people.length) continue

    const { data: prefs } = await db
      .from("notification_preferences")
      .select("user_id, channel, enabled")
      .eq("event_type", event.type)
      .in("user_id", people)
    const wants = (user: string, channel: PersonChannel) =>
      prefs?.find((p) => p.user_id === user && p.channel === channel)?.enabled ?? audience.defaults.includes(channel)

    const inApp = people.filter((u) => wants(u, "in_app")).map((user_id) => ({ user_id, org_id: event.org_id, event_id: event.id }))
    const deliveries = personChannels
      .filter((c) => c !== "in_app" && (c !== "email" || emailConfigured()))
      .flatMap((channel) => people.filter((u) => wants(u, channel)).map((user_id) => ({ event_id: event.id, org_id: event.org_id, user_id, channel })))
    if (inApp.length) await db.from("notifications").upsert(inApp, { onConflict: "user_id,event_id", ignoreDuplicates: true })
    if (deliveries.length) await db.from("event_deliveries").insert(deliveries)
  }
  return events?.length ?? 0
}
