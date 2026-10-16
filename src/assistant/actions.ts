"use server"

import type { UIMessage } from "ai"
import { getContext } from "@/lib/context"
import type { Provider } from "./providers"

// Sprout panel data, loaded when the panel opens (not on every page): models of the person's keys, recent chats.
export async function sproutSetup() {
  const ctx = await getContext()
  const [{ data: keys }, { data: chats }, { data: org }] = await Promise.all([
    ctx.supabase.from("ai_keys").select("provider, models").eq("user_id", ctx.userId),
    ctx.supabase.from("assistant_chats").select("id, title, starred, updated_at").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).order("starred", { ascending: false }).order("updated_at", { ascending: false }).limit(30),
    ctx.supabase.from("orgs").select("allow_ai").eq("id", ctx.org.id).maybeSingle(),
  ])
  const models = (keys ?? []).flatMap((k) => (Array.isArray(k.models) ? (k.models as { id: string; name: string }[]) : []).map((m) => ({ provider: k.provider as Provider, id: m.id, name: m.name })))
  return { models, chats: chats ?? [], aiOff: org?.allow_ai === false, orgId: ctx.org.id, orgName: ctx.org.name }
}

export async function loadChat(id: string) {
  const ctx = await getContext()
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await ctx.supabase.from("assistant_chats").select("id, title, starred, model, messages").eq("id", id).eq("user_id", ctx.userId).maybeSingle()
  return data ? { ...data, messages: data.messages as unknown as UIMessage[] } : null
}

export async function starChat(id: string, starred: boolean) {
  const ctx = await getContext()
  await ctx.supabase.from("assistant_chats").update({ starred }).eq("id", id).eq("user_id", ctx.userId)
}

export async function deleteChat(id: string) {
  const ctx = await getContext()
  await ctx.supabase.from("assistant_chats").delete().eq("id", id).eq("user_id", ctx.userId)
}
