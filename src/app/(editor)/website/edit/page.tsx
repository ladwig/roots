import { notFound, redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { createStarterSite } from "@/sites/starter"

// Entry from the sidebar: opens the home page (or the first page) in the editor; first visit creates the starter site.
export default async function WebsiteEntry() {
  const ctx = await requirePerm("sites.manage")
  if (!ctx.modules.has("sites")) notFound()
  const first = () => ctx.supabase.from("site_pages").select("id").eq("org_id", ctx.org.id).is("deleted_at", null).order("position").order("created_at").limit(1).maybeSingle()
  let { data: page } = await first()
  if (!page) {
    await createStarterSite(ctx, await getT())
    page = (await first()).data
  }
  if (!page) notFound()
  redirect(`/website/${page.id}/edit`)
}

export const instant = false
