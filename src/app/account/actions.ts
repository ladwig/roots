"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { authError, dbError } from "@/i18n/translate"
import { getSession } from "@/lib/context"
import { back } from "@/lib/url"
import { eventTypes, personChannels } from "@/events/registry"

const backTo = (formData: FormData) => (formData.get("back") === "/settings/profile" ? "/settings/profile" : "/account")

export async function updateName(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const t = await getT()
  const full_name = String(formData.get("full_name") ?? "").trim() || null
  const { error } = await session.supabase.from("profiles").update({ full_name }).eq("id", session.userId)
  if (error) back(backTo(formData), { error: dbError(t, error) })
  back(backTo(formData), { ok: t("account.saved") })
}

export async function updatePassword(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const t = await getT()
  const password = String(formData.get("password") ?? "")
  if (password.length < 8) back(backTo(formData), { error: t("auth.passwordTooShort") })
  if (password !== String(formData.get("repeat") ?? "")) back(backTo(formData), { error: t("account.passwordsDontMatch") })
  const { error } = await session.supabase.auth.updateUser({ password })
  if (error) back(backTo(formData), { error: authError(t, error) })
  back(backTo(formData), { ok: t("account.passwordChanged") })
}

// Saves the whole grid: every visible event type × channel gets an explicit on/off.
export async function savePreferences(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const t = await getT()
  const rows = eventTypes
    .filter((e) => e.audience && (!e.audience.platform || session.isPlatformAdmin))
    .flatMap((e) =>
      personChannels.map((channel) => ({ user_id: session.userId, event_type: e.key, channel, enabled: formData.get(`${e.key}:${channel}`) === "on" }))
    )
  const { error } = await session.supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,event_type,channel" })
  if (error) back(backTo(formData), { error: dbError(t, error) })
  back(backTo(formData), { ok: t("prefs.saved") })
}
