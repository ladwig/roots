import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Channel, EventRow } from "../worker"

// One roots bot for everyone (TELEGRAM_BOT_TOKEN). Orgs link a chat with a one-time code (see linkChat).
const api = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).then(async (r) => {
    const json = await r.json()
    if (!json.ok) throw new Error(json.description ?? `HTTP ${r.status}`)
    return json.result
  })

// ponytail: messages in German (German-first); use the org's language once orgs have one.
const t = createT("de", messages.de)

export function eventText(event: Pick<EventRow, "type" | "payload">) {
  const p = (event.payload ?? {}) as Record<string, unknown>
  const vars: Record<string, string> = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v ?? "")]))
  if (typeof p.amount === "number") vars.amount = t.money(p.amount, String(p.currency ?? "eur"))
  vars.who = String(p.customer_email || p.email || "–")
  return t.has(`events.messages.${event.type}`) ? t.dynamic(`events.messages.${event.type}`, vars) : event.type
}

export const telegramChannel: Channel = {
  async send(subscription, event) {
    const chatId = (subscription.config as Record<string, unknown>).chat_id
    if (!chatId) throw new Error("telegram chat not linked")
    await api("sendMessage", { chat_id: chatId, text: eventText(event) })
  },
}

/** Handles a Telegram update: "/start <code>" (private chat or group) links that chat to the waiting subscription. */
export async function handleTelegramUpdate(update: { message?: { text?: string; chat: { id: number; title?: string; username?: string; first_name?: string } } }) {
  const msg = update.message
  const code = msg?.text?.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})/)?.[1]
  if (!msg || !code) return
  const db = createAdminClient()
  const { data: sub } = await db
    .from("event_subscriptions")
    .select("id, org_id, orgs(name)")
    .eq("channel", "telegram")
    .eq("config->>link_code", code)
    .maybeSingle()
  if (!sub) return api("sendMessage", { chat_id: msg.chat.id, text: t("notifications.telegram.unknownCode") })
  const title = msg.chat.title ?? msg.chat.username ?? msg.chat.first_name ?? ""
  await db.from("event_subscriptions").update({ config: { chat_id: msg.chat.id, chat_title: title } }).eq("id", sub.id)
  await api("sendMessage", { chat_id: msg.chat.id, text: t("notifications.telegram.linked", { org: sub.orgs?.name ?? "" }) })
}

/** Local development: Telegram can't reach localhost, so poll for updates instead of the webhook. */
let offset = 0
export async function pollTelegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_POLLING !== "1") return
  const updates: { update_id: number }[] = await api("getUpdates", { offset, timeout: 0 })
  for (const u of updates) {
    offset = u.update_id + 1
    await handleTelegramUpdate(u as Parameters<typeof handleTelegramUpdate>[0]).catch(console.error)
  }
}
