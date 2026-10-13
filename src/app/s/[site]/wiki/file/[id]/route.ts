import { NextResponse } from "next/server"
import { outsideFileUrl, portalMember } from "@/wiki/outside"
import { getSite } from "../../../data"

// Images/files of wiki pages outside the team: public pages for anyone, member pages for signed-in members.
export async function GET(_request: Request, { params }: { params: Promise<{ site: string; id: string }> }) {
  const { site, id } = await params
  const s = await getSite(site)
  if (!s) return new NextResponse("Not found", { status: 404 })
  const url = (await outsideFileUrl(s.org.id, id, "public")) ?? ((await portalMember(s.org.id)) ? await outsideFileUrl(s.org.id, id, "members") : null)
  return url ? NextResponse.redirect(url) : new NextResponse("Not found", { status: 404 })
}
