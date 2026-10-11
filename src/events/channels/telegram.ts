import { getSecret } from "@/integrations/server"
import { tg } from "@/integrations/telegram"
import { renderEvent } from "../render"
import type { Channel } from "../worker"

// Sends events through the org's own Telegram bot to the chat chosen in the subscription.
// ponytail: German (German-first); use the org's language once orgs have one.
export const telegramChannel: Channel = {
  async send(subscription, event) {
    const chatId = (subscription.config as Record<string, unknown>).chat_id
    if (!chatId) throw new Error("no telegram chat chosen")
    const secret = await getSecret(subscription.org_id, "telegram")
    if (!secret?.botToken) throw new Error("telegram bot not connected")
    await tg(secret.botToken, "sendMessage", { chat_id: chatId, text: renderEvent(event, "de").title })
  },
}
