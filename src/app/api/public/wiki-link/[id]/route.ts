import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/server"
import { siteUrl } from "@/lib/url"

// One link for every wiki page: visitors without App access land here (from the proxy or the page) and go on to the
// public page or the member area when the page is released there, else to the login.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (/^[0-9a-f-]{36}$/.test(id)) {
    const { data } = await createPublicClient().rpc("wiki_outside_target", { p_page: id })
    const target = data as { slug: string; level: string } | null
    if (target) return NextResponse.redirect(siteUrl(target.slug, target.level === "public" ? `/wiki/${id}` : `/portal/wiki/${id}`))
  }
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/wiki/${id}`)}`, request.url))
}
