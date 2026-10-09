"use server"

import { cookies } from "next/headers"
import { isLocale } from "./config"
import { createClient } from "@/lib/supabase/server"
import { LOCALE_COOKIE } from "./server"

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  // Signed in: remember it on the profile too (emails, other devices). No-op when signed out.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) await supabase.from("profiles").update({ locale }).eq("id", data.claims.sub)
}

// After sign-in: use the language saved on the profile on this device too.
export async function adoptProfileLocale() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return
  const { data: profile } = await supabase.from("profiles").select("locale").eq("id", data.claims.sub).maybeSingle()
  if (isLocale(profile?.locale))
    (await cookies()).set(LOCALE_COOKIE, profile.locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
}
