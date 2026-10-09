"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { authError } from "@/i18n/translate"
import { createClient } from "@/lib/supabase/server"
import { APP_URL, safeNext } from "@/lib/url"

const loginUrl = (next: string, result: Record<string, string>) =>
  `/login?${new URLSearchParams({ ...result, ...(next !== "/" && { next }) })}`

function read(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    next: safeNext(formData.get("next")),
  }
}

const callback = (next: string) => `${APP_URL}/auth/callback?next=${encodeURIComponent(next)}`

export async function signIn(formData: FormData) {
  const { email, password, next } = read(formData)
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect(loginUrl(next, { error: authError(await getT(), error) }))
  redirect(next)
}

export async function signUp(formData: FormData) {
  const { email, password, next } = read(formData)
  const t = await getT()
  if (password.length < 8) redirect(loginUrl(next, { error: t("auth.passwordTooShort") }))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(next) } })
  if (error) redirect(loginUrl(next, { error: authError(t, error) }))
  if (data.session) redirect(next)
  redirect(loginUrl(next, { ok: t("auth.confirmEmail", { email }) }))
}

export async function sendMagicLink(formData: FormData) {
  const { email, next } = read(formData)
  const t = await getT()
  if (!email.includes("@")) redirect(loginUrl(next, { error: t("auth.enterEmail") }))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } })
  if (error) redirect(loginUrl(next, { error: authError(t, error) }))
  redirect(loginUrl(next, { ok: t("auth.magicLinkSent", { email }) }))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
