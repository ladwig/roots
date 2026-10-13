import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deliverSoon } from "@/events/worker"
import { getIntegration } from "@/integrations/registry"

// Single webhook entry: verify → store once in integration_events → handle → mark processed.
// A failed event returns 500 so the provider retries; retries of an unprocessed event are handled again.
export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await params
  const webhook = getIntegration(provider)?.webhook
  if (!webhook) return new NextResponse("Not found", { status: 404 })

  const body = await request.text()
  let event
  try {
    event = await webhook.verify(request, body)
  } catch {
    return new NextResponse("Invalid signature", { status: 400 })
  }

  const db = createAdminClient()
  await db.from("integration_events").upsert(
    {
      provider,
      external_id: event.externalId,
      org_id: event.orgId ?? null,
      type: event.type ?? null,
      payload: event.payload as never,
    },
    { onConflict: "provider,external_id", ignoreDuplicates: true }
  )
  const { data: row, error } = await db
    .from("integration_events")
    .select("id, processed_at, attempts")
    .eq("provider", provider)
    .eq("external_id", event.externalId)
    .single()
  if (error) return new NextResponse("Could not store event", { status: 500 })
  if (row.processed_at) return NextResponse.json({ duplicate: true })

  // Atomic claim: only one delivery wins; a lock older than 5 min counts as a crashed handler.
  const stale = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: claimed, error: claimError } = await db
    .from("integration_events")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("processed_at", null)
    .or(`locked_at.is.null,locked_at.lt.${stale}`)
    .select("id")
  if (claimError) return new NextResponse("Could not claim event", { status: 500 })
  if (!claimed?.length) return NextResponse.json({ duplicate: true })

  try {
    await webhook.handle(event)
    await db.from("integration_events").update({ processed_at: new Date().toISOString(), error: null, locked_at: null }).eq("id", row.id)
    deliverSoon() // e.g. order.paid → org notifications
    return NextResponse.json({ ok: true })
  } catch (e) {
    await db
      .from("integration_events")
      .update({ attempts: row.attempts + 1, error: e instanceof Error ? e.message : String(e), locked_at: null })
      .eq("id", row.id)
    return new NextResponse("Handler failed", { status: 500 })
  }
}
