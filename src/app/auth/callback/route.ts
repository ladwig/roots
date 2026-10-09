import { NextResponse } from "next/server"
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
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }
  return NextResponse.redirect(new URL("/login?error=This+link+is+invalid+or+has+expired.", url.origin))
}
