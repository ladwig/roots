// Routes new events to people, then sends due deliveries. Runs from the cron route (every minute) and right
// after actions that emit events. Any other worker (e.g. Celery) can do the same through the database functions
// claim_unrouted_events / claim_event_deliveries / finish_event_delivery.
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { emailChannel } from "./channels/email"
import { telegramChannel } from "./channels/telegram"
import { webhookChannel } from "./channels/webhook"
import { routeEvents } from "./router"

export type EventRow = Database["public"]["Tables"]["events"]["Row"]
export type SubscriptionRow = Database["public"]["Tables"]["event_subscriptions"]["Row"]
/** Org destinations (webhook, Telegram, …) */
export type Channel = { send(subscription: SubscriptionRow, event: EventRow): Promise<void> }
/** Channels to a person (email, push, …); in-app needs no sending */
export type PersonChannelSender = { send(person: { email: string; locale: string | null }, event: EventRow): Promise<void> }

const orgChannels: Record<string, Channel> = { webhook: webhookChannel, telegram: telegramChannel }
const personSenders: Record<string, PersonChannelSender> = { email: emailChannel }

export async function deliverDue(limit = 25) {
  if (!process.env.SUPABASE_SECRET_KEY) return 0
  await routeEvents().catch(console.error)
  const db = createAdminClient()
  const { data: ids, error } = await db.rpc("claim_event_deliveries", { p_limit: limit })
  if (error) throw error
  if (!ids?.length) return 0
  const { data: rows } = await db.from("event_deliveries").select("id, user_id, channel, events(*), event_subscriptions(*)").in("id", ids)
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter((u): u is string => !!u))]
  const { data: profiles } = userIds.length ? await db.from("profiles").select("id, email, locale").in("id", userIds) : { data: [] }

  await Promise.all(
    (rows ?? []).map(async (d) => {
      try {
        if (d.event_subscriptions) {
          const channel = orgChannels[d.event_subscriptions.channel]
          if (!channel) throw new Error(`unknown channel ${d.event_subscriptions.channel}`)
          await channel.send(d.event_subscriptions, d.events!)
        } else {
          const sender = personSenders[d.channel ?? ""]
          const person = profiles?.find((p) => p.id === d.user_id)
          if (!sender || !person) throw new Error(`cannot send ${d.channel} to ${d.user_id}`)
          await sender.send(person, d.events!)
        }
        await db.rpc("finish_event_delivery", { p_id: d.id, p_ok: true })
      } catch (e) {
        await db.rpc("finish_event_delivery", { p_id: d.id, p_ok: false, p_error: e instanceof Error ? e.message : String(e) })
      }
    })
  )
  return rows?.length ?? 0
}

/** Call after an action that may have emitted events: routes and delivers once the response is sent. */
export const deliverSoon = () => after(() => deliverDue().catch(console.error))
