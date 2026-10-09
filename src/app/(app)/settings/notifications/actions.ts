"use server"

import { randomBytes } from "node:crypto"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { isAllowedUrl } from "@/events/channels/webhook"
import type { TelegramChat } from "@/integrations/telegram"
import { TEST_EVENT, eventTypes } from "@/events/registry"
import { deliverSoon } from "@/events/worker"
import { requirePerm } from "@/lib/context"
import { createAdminClient } from "@/lib/supabase/admin"
import { back } from "@/lib/url"

const PATH = "/settings/integrations"
const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`

// Chats the org's bot knows (collected from Telegram updates, see src/integrations/telegram.ts).
export async function telegramChats(orgId: string): Promise<TelegramChat[]> {
  const ctx = await requirePerm("org.integrations.manage")
  const { data } = await ctx.supabase.from("org_integrations").select("config, status").eq("org_id", orgId).eq("provider", "telegram").maybeSingle()
  return data?.status === "connected" ? (((data.config ?? {}) as { chats?: TelegramChat[] }).chats ?? []) : []
}

export type CreateState = { error?: string; id?: string; secret?: string }

export async function createSubscription(_: CreateState, formData: FormData): Promise<CreateState> {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const channel = formData.get("channel") === "telegram" ? "telegram" : "webhook"
  const name = String(formData.get("name") ?? "").trim() || t(`notifications.channels.${channel}`)
  const url = String(formData.get("url") ?? "").trim()
  if (channel === "webhook" && !isAllowedUrl(url)) return { error: t("notifications.urlInvalid") }

  let config: Record<string, unknown> = { url }
  if (channel === "telegram") {
    const chat = (await telegramChats(ctx.org.id)).find((c) => String(c.id) === String(formData.get("chat_id")))
    if (!chat) return { error: t("notifications.telegram.notConnected") }
    config = { chat_id: chat.id, chat_title: chat.title }
  }
  const { data, error } = await ctx.supabase
    .from("event_subscriptions")
    .insert({ org_id: ctx.org.id, name, channel, config: config as never, event_types: ["*"] })
    .select("id")
    .single()
  if (error) return { error: dbError(t, error) }
  if (channel === "telegram") return { id: data.id }

  const secret = newSecret()
  const { error: secretError } = await ctx.supabase.rpc("set_subscription_secret", { p_subscription: data.id, p_secret: secret })
  if (secretError) return { error: dbError(t, secretError) }
  return { id: data.id, secret }
}

export async function rotateSecret(id: string): Promise<CreateState> {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const secret = newSecret()
  const { error } = await ctx.supabase.rpc("set_subscription_secret", { p_subscription: id, p_secret: secret })
  return error ? { error: dbError(t, error) } : { id, secret }
}

export async function updateSubscription(id: string, formData: FormData) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const retry = `${PATH}?edit=${id}`
  const known = new Set(eventTypes.map((e) => e.key))
  const chosen = formData.getAll("events").map(String)
  const event_types = chosen.includes("*") ? ["*"] : chosen.filter((e) => known.has(e))
  const { data: sub } = await ctx.supabase.from("event_subscriptions").select("channel, config").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!sub) back(PATH, { error: t("errors.not_allowed") })

  let config = sub.config as Record<string, unknown>
  if (sub.channel === "telegram" && formData.get("chat_id")) {
    const chat = (await telegramChats(ctx.org.id)).find((c) => String(c.id) === String(formData.get("chat_id")))
    if (chat) config = { chat_id: chat.id, chat_title: chat.title }
  }
  if (sub.channel === "webhook") {
    const url = String(formData.get("url") ?? "").trim()
    if (!isAllowedUrl(url)) back(retry, { error: t("notifications.urlInvalid") })
    config = { ...config, url }
  }
  const { error } = await ctx.supabase
    .from("event_subscriptions")
    .update({ name: String(formData.get("name") ?? "").trim() || "–", event_types, active: formData.get("active") === "on", config: config as never })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error) back(retry, { error: dbError(t, error) })
  back(retry, { ok: t("notifications.saved") })
}

// Sends a test event to this one subscription only (not a real event, so not fanned out).
export async function sendTest(id: string) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const { data: sub } = await ctx.supabase.from("event_subscriptions").select("id").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!sub) back(PATH, { error: t("errors.not_allowed") })
  const db = createAdminClient()
  const { data: event, error } = await db
    .from("events")
    .insert({ org_id: ctx.org.id, type: TEST_EVENT, actor_id: ctx.userId, payload: { message: "Hello from roots" } })
    .select("id")
    .single()
  if (!error) await db.from("event_deliveries").insert({ org_id: ctx.org.id, event_id: event.id, subscription_id: id })
  if (error) back(`${PATH}?edit=${id}`, { error: dbError(t, error) })
  deliverSoon()
  back(`${PATH}?edit=${id}`, { ok: t("notifications.testSent") })
}

export async function deleteSubscription(id: string) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const { error } = await ctx.supabase.from("event_subscriptions").delete().eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(`${PATH}?edit=${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("notifications.deleted") })
}
