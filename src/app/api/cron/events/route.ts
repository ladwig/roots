import { NextResponse } from "next/server"
import { generateAllSeries } from "@/shifts/server"
import { pollTelegram } from "@/integrations/telegram"
import { deliverDue } from "@/events/worker"
import { processEmailQueue } from "@/email/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Called every minute (vercel.json cron, or `npm run worker` locally). Protected by CRON_SECRET.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse("Unauthorized", { status: 401 })
  await pollTelegram().catch(console.error)
  let sent = 0
  for (let round = 0; round < 10; round++) {
    const n = await deliverDue() // routes new events first
    sent += n
    if (n === 0) break
  }
  // Email module queue (campaigns + automations), after the events so automations of new events are queued.
  const emails = await processEmailQueue().catch((e) => (console.error(e), 0))
  await generateAllSeries().catch(console.error) // recurring shifts stay 8 weeks ahead
  // Empty the trash (soft-deleted rows past their retention).
  const { data: purged } = await createAdminClient().rpc("purge_deleted")
  await createAdminClient().rpc("purge_portal_tokens") // expired portal logins/sessions
  return NextResponse.json({ sent, emails, purged })
}
