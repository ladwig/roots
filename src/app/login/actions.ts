"use server"

import { redirect } from "next/navigation"
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
  if (error) redirect(loginUrl(next, { error: error.message }))
  redirect(next)
}

export async function signUp(formData: FormData) {
  const { email, password, next } = read(formData)
  if (password.length < 8) redirect(loginUrl(next, { error: "Use at least 8 characters for your password." }))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(next) } })
  if (error) redirect(loginUrl(next, { error: error.message }))
  if (data.session) redirect(next)
  redirect(loginUrl(next, { ok: `Check ${email} for a link to confirm your account.` }))
}

export async function sendMagicLink(formData: FormData) {
  const { email, next } = read(formData)
  if (!email.includes("@")) redirect(loginUrl(next, { error: "Enter your email address first." }))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } })
  if (error) redirect(loginUrl(next, { error: error.message }))
  redirect(loginUrl(next, { ok: `We sent a sign-in link to ${email}.` }))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
