"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { ACTIVE_ORG_COOKIE, getSession } from "@/lib/context"
import { back } from "@/lib/url"

export async function acceptInvite(token: string) {
  const session = await getSession()
  if (!session) redirect(`/login?next=/invite/${token}`)
  const { data, error } = await session.supabase.rpc("accept_invite", { p_token: token })
  if (error) back(`/invite/${token}`, { error: dbError(await getT(), error) })
  ;(await cookies()).set(ACTIVE_ORG_COOKIE, data!, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  redirect("/")
}
