import { after, NextResponse } from "next/server"
import ffmpegPath from "ffmpeg-static"
import { processAudio } from "@/shop/audio"

export const maxDuration = 300

// The audio worker (shop music): converts uploaded masters and builds album ZIPs (src/shop/audio.ts). Started right
// after an upload and by the minute worker while audio_due(); answers at once and works on in after(). CRON_SECRET.
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse("Unauthorized", { status: 401 })
  if (!ffmpegPath) return new NextResponse("ffmpeg missing", { status: 500 })
  after(() => processAudio(ffmpegPath!).catch(console.error))
  return NextResponse.json({ started: true }, { status: 202 })
}
