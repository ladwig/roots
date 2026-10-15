"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { setActiveOrg, getSession } from "@/lib/context"
import { back, APP_HOME } from "@/lib/url"

export async function createOrg(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login")
  const t = await getT()
  const retry = formData.get("new") ? "/onboarding?new=1" : "/onboarding"
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  if (!name) back(retry, { error: t("onboarding.nameRequired") })
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) back(retry, { error: t("onboarding.addressInvalid") })

  const { data, error } = await session.supabase.rpc("create_org", { p_name: name, p_slug: slug })
  if (error) back(retry, { error: error.code === "23505" ? t("onboarding.addressTaken") : dbError(t, error) })
  await setActiveOrg(data!)
  redirect(APP_HOME)
}

/** Join an org you were invited to (by your confirmed email, without the link). */
export async function acceptMyInvite(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login")
  const { data, error } = await session.supabase.rpc("accept_my_invite", { p_invite: String(formData.get("id") ?? "") })
  if (error) back("/onboarding", { error: dbError(await getT(), error) })
  deliverSoon()
  await setActiveOrg(data!)
  redirect(APP_HOME)
}
