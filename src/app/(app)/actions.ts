"use server"

import { APP_HOME, siteUrl } from "@/lib/url"
import { redirect } from "next/navigation"
import { setActiveOrg, getContext } from "@/lib/context"
import { loginTokenForContact } from "@/portal/session"

export async function switchOrg(orgId: string) {
  const ctx = await getContext()
  if (!ctx.orgs.some((o) => o.id === orgId)) return
  await setActiveOrg(orgId)
  redirect(APP_HOME)
}

/** "Mein Mitgliederbereich": a team user whose contact is linked opens the member area as that contact (one click on
 * the login page there, which also works across the org's own domain). */
export async function openMyMemberArea() {
  const ctx = await getContext()
  const { data: me } = await ctx.supabase.from("contacts").select("id").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).is("deleted_at", null).maybeSingle()
  if (!me) redirect(APP_HOME)
  const token = await loginTokenForContact(ctx.org.id, me.id)
  redirect(`${siteUrl(ctx.org.slug, "/portal/login", ctx.org.site_domain)}?token=${token}`)
}
