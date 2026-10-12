import { NextResponse } from "next/server"
import { unsubscribe } from "@/email/server"

// One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header.
export async function POST(_req: Request, { params }: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await params
  return (await unsubscribe(token)) ? new NextResponse(null, { status: 204 }) : new NextResponse("Not found", { status: 404 })
}
