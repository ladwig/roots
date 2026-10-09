import { createHmac } from "node:crypto"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import type { Config, Integration } from "./registry"
import { getSecret } from "./server"

// Each org connects its own Telegram bot (token from @BotFather). roots learns the bot's chats automatically:
// when the bot is added to a group, or someone writes it /start. Those chats can then receive notifications.
// Production: Telegram calls /api/webhooks/telegram?org=<id> (secret header derived from the token).
// Local: no public URL, so the cron worker polls getUpdates (TELEGRAM_POLLING=1).

export type TelegramChat = { id: number; title: string; type: string }
type Update = {
  update_id: number
  message?: { text?: string; chat: { id: number; type: string; title?: string; username?: string; first_name?: string } }
  my_chat_member?: { chat: { id: number; type: string; title?: string; username?: string; first_name?: string }; new_chat_member: { status: string } }
}

export async function tg<T = unknown>(token: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) throw new Error(json.description ?? `HTTP ${res.status}`)
  return json.result
}

const webhookToken = (orgId: string, botToken: string) => createHmac("sha256", botToken).update(`roots-telegram:${orgId}`).digest("hex")
const usesWebhook = () => APP_URL.startsWith("https://") && process.env.TELEGRAM_POLLING !== "1"
// ponytail: bot replies in German (German-first); use the org's language once orgs have one.
const t = createT("de", messages.de)

const chatTitle = (c: { title?: string; username?: string; first_name?: string; id: number }) => c.title ?? c.username ?? c.first_name ?? String(c.id)

async function updateChats(orgId: string, change: (chats: TelegramChat[]) => TelegramChat[]) {
  const db = createAdminClient()
  const { data } = await db.from("org_integrations").select("config").eq("org_id", orgId).eq("provider", "telegram").maybeSingle()
  if (!data) return
  const config = (data.config ?? {}) as Config
  const chats = change((config.chats as TelegramChat[] | undefined) ?? [])
  await db.from("org_integrations").update({ config: { ...config, chats } as never }).eq("org_id", orgId).eq("provider", "telegram")
}

export async function handleTelegramUpdate(orgId: string, update: Update) {
  const secret = await getSecret(orgId, "telegram")
  if (!secret?.botToken) return
  const member = update.my_chat_member
  if (member) {
    const chat = { id: member.chat.id, title: chatTitle(member.chat), type: member.chat.type }
    const inChat = ["member", "administrator", "creator"].includes(member.new_chat_member.status)
    await updateChats(orgId, (chats) => [...chats.filter((c) => c.id !== chat.id), ...(inChat ? [chat] : [])])
    return
  }
  const msg = update.message
  if (msg?.text?.startsWith("/start")) {
    await updateChats(orgId, (chats) => [...chats.filter((c) => c.id !== msg.chat.id), { id: msg.chat.id, title: chatTitle(msg.chat), type: msg.chat.type }])
    const { data: org } = await createAdminClient().from("orgs").select("name").eq("id", orgId).maybeSingle()
    await tg(secret.botToken, "sendMessage", { chat_id: msg.chat.id, text: t("notifications.telegram.linked", { org: org?.name ?? "" }) })
  }
}

export const telegram: Integration = {
  key: "telegram",
  name: "Telegram",
  fields: [{ key: "botToken", secret: true, placeholder: "123456789:AA…" }],
  async test(secret) {
    try {
      const me = await tg<{ id: number; username: string }>(secret.botToken, "getMe")
      return { bot_username: me.username, bot_id: String(me.id) }
    } catch {
      throw new Error("integrations.telegram.invalidToken")
    }
  },
  async onConnected({ orgId, secret }) {
    if (usesWebhook())
      await tg(secret.botToken, "setWebhook", {
        url: `${APP_URL}/api/webhooks/telegram?org=${orgId}`,
        secret_token: webhookToken(orgId, secret.botToken),
        allowed_updates: ["message", "my_chat_member"],
      })
    else await tg(secret.botToken, "deleteWebhook") // polling locally
  },
  async disconnect({ secret }) {
    if (secret?.botToken) await tg(secret.botToken, "deleteWebhook")
  },
  webhook: {
    async verify(req, body) {
      const orgId = new URL(req.url).searchParams.get("org") ?? ""
      const secret = /^[0-9a-f-]{36}$/.test(orgId) ? await getSecret(orgId, "telegram") : null
      if (!secret?.botToken || req.headers.get("x-telegram-bot-api-secret-token") !== webhookToken(orgId, secret.botToken))
        throw new Error("invalid signature")
      const update = JSON.parse(body) as Update
      return { externalId: `${orgId}:${update.update_id}`, type: update.my_chat_member ? "my_chat_member" : "message", orgId, payload: update }
    },
    handle: ({ orgId, payload }) => (orgId ? handleTelegramUpdate(orgId, payload as Update) : Promise.resolve()),
  },
}

/** Local development: poll every connected bot (Telegram can't reach localhost). */
const offsets = new Map<string, number>()
export async function pollTelegram() {
  if (usesWebhook() || !process.env.SUPABASE_SECRET_KEY) return
  const { data } = await createAdminClient().from("org_integrations").select("org_id").eq("provider", "telegram").eq("status", "connected")
  for (const { org_id } of data ?? []) {
    const secret = await getSecret(org_id, "telegram")
    if (!secret?.botToken) continue
    const updates = await tg<Update[]>(secret.botToken, "getUpdates", { offset: offsets.get(org_id) ?? 0, timeout: 0, allowed_updates: ["message", "my_chat_member"] }).catch(() => [])
    for (const u of updates) {
      offsets.set(org_id, u.update_id + 1)
      await handleTelegramUpdate(org_id, u).catch(console.error)
    }
  }
}
