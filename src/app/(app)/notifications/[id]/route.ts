import { NextResponse } from "next/server"
import { renderEvent } from "@/events/render"
import { getSession, setActiveOrg } from "@/lib/context"
import { APP_URL } from "@/lib/url"

// Opening a notification: mark it read, switch to its org, go to what it's about.
export async function GET(_: Request, { params }: RouteContext<"/notifications/[id]">) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.redirect(`${APP_URL}/login`)
  const { data: n } = await session.supabase
    .from("notifications")
    .select("id, org_id, events:hub_events(type, payload)")
    .eq("id", Number(id))
    .eq("user_id", session.userId)
    .maybeSingle()
  if (!n) return NextResponse.redirect(`${APP_URL}/notifications`)
  await session.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id).is("read_at", null)
  if (n.org_id) await setActiveOrg(n.org_id)
  const href = n.events ? renderEvent(n.events, null).href : undefined
  return NextResponse.redirect(`${APP_URL}${href ?? "/notifications"}`)
}
