import { NextResponse } from "next/server"
import { pollTelegram } from "@/integrations/telegram"
import { deliverDue } from "@/events/worker"

// Called every minute (vercel.json cron, or `npm run worker` locally). Protected by CRON_SECRET.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse("Unauthorized", { status: 401 })
  await pollTelegram().catch(console.error)
  let sent = 0
  for (let round = 0; round < 10; round++) {
    const n = await deliverDue()
    sent += n
    if (n === 0) break
  }
  return NextResponse.json({ sent })
}
