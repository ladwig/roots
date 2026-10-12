import { NextResponse } from "next/server"
import { getContext } from "@/lib/context"

// Opens a file through a short-lived signed URL (RLS decides whether the row and the object are visible).
// ?download=1 forces a download with the original name.
export async function GET(request: Request, { params }: RouteContext<"/files/[id]">) {
  const { id } = await params
  const ctx = await getContext()
  const { data: file } = await ctx.supabase.from("files").select("path, name").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!file) return new NextResponse("Not found", { status: 404 })
  const download = new URL(request.url).searchParams.has("download") ? file.name : undefined
  const { data } = await ctx.supabase.storage.from("files").createSignedUrl(file.path, 60, { download })
  if (!data?.signedUrl) return new NextResponse("Not found", { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
