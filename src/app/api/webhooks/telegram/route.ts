import { NextResponse } from "next/server"
import { handleTelegramUpdate } from "@/events/channels/telegram"

// Telegram bot webhook (set once with setWebhook + secret_token = TELEGRAM_WEBHOOK_SECRET).
export async function POST(request: Request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET)
    return new NextResponse("Unauthorized", { status: 401 })
  await handleTelegramUpdate(await request.json()).catch(console.error)
  return NextResponse.json({ ok: true })
}
