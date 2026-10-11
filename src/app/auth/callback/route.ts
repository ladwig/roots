import { NextResponse } from "next/server"
import { adoptProfileLocale } from "@/i18n/actions"
import { getT } from "@/i18n/server"
import { createClient } from "@/lib/supabase/server"
import { safeNext } from "@/lib/url"

// Email confirmation + magic links land here with a PKCE code.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = safeNext(url.searchParams.get("next"))
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await adoptProfileLocale()
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }
  const t = await getT()
  return NextResponse.redirect(new URL(`/login?${new URLSearchParams({ error: t("auth.linkInvalid") })}`, url.origin))
}
