import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { getSecret } from "@/integrations/server"
import { tg } from "@/integrations/telegram"
import type { Channel, EventRow } from "../worker"

// Sends events through the org's own Telegram bot to the chat chosen in the subscription.
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
    if (!chatId) throw new Error("no telegram chat chosen")
    const secret = await getSecret(subscription.org_id, "telegram")
    if (!secret?.botToken) throw new Error("telegram bot not connected")
    await tg(secret.botToken, "sendMessage", { chat_id: chatId, text: eventText(event) })
  },
}
