"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { authError, dbError } from "@/i18n/translate"
import { getSession } from "@/lib/context"
import { back } from "@/lib/url"

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
