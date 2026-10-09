"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { setActiveOrg, getSession } from "@/lib/context"
import { back } from "@/lib/url"

export async function acceptInvite(token: string) {
  const session = await getSession()
  if (!session) redirect(`/login?next=/invite/${token}`)
  const { data, error } = await session.supabase.rpc("accept_invite", { p_token: token })
  if (error) back(`/invite/${token}`, { error: dbError(await getT(), error) })
  await setActiveOrg(data!)
  redirect("/")
}
