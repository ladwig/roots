import { NextResponse } from "next/server"
import { requirePerm } from "@/lib/context"
import { sepaXml } from "@/members/server"

// The run's direct debits as pain.008 XML, for upload to the org's online banking.
export async function GET(_req: Request, { params }: RouteContext<"/members/sepa/[id]">) {
  const { id } = await params
  const ctx = await requirePerm("members.view")
  const file = await sepaXml(ctx.supabase, ctx.org, id)
  if (!file) return new NextResponse("Not found", { status: 404 })
  return new NextResponse(file.xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="${file.filename}"` },
  })
}
