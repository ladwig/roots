// Sends due deliveries. Runs from the cron route (every minute) and right after actions that emit events.
// Any other worker (e.g. Celery) can do the same: claim_event_deliveries() → send → finish_event_delivery().
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { telegramChannel } from "./channels/telegram"
import { webhookChannel } from "./channels/webhook"

export type EventRow = Database["public"]["Tables"]["events"]["Row"]
export type SubscriptionRow = Database["public"]["Tables"]["event_subscriptions"]["Row"]
export type Channel = { send(subscription: SubscriptionRow, event: EventRow): Promise<void> }

const channels: Record<string, Channel> = { webhook: webhookChannel, telegram: telegramChannel }

export async function deliverDue(limit = 25) {
  if (!process.env.SUPABASE_SECRET_KEY) return 0
  const db = createAdminClient()
  const { data: ids, error } = await db.rpc("claim_event_deliveries", { p_limit: limit })
  if (error) throw error
  if (!ids?.length) return 0
  const { data: rows } = await db.from("event_deliveries").select("id, events(*), event_subscriptions(*)").in("id", ids)
  await Promise.all(
    (rows ?? []).map(async (d) => {
      try {
        const channel = channels[d.event_subscriptions!.channel]
        if (!channel) throw new Error(`unknown channel ${d.event_subscriptions!.channel}`)
        await channel.send(d.event_subscriptions!, d.events!)
        await db.rpc("finish_event_delivery", { p_id: d.id, p_ok: true })
      } catch (e) {
        await db.rpc("finish_event_delivery", { p_id: d.id, p_ok: false, p_error: e instanceof Error ? e.message : String(e) })
      }
    })
  )
  return rows?.length ?? 0
}

/** Call after an action that may have emitted events: delivers once the response is sent. */
export const deliverSoon = () => after(() => deliverDue().catch(console.error))
