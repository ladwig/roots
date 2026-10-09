"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { ACTIVE_ORG_COOKIE, getSession } from "@/lib/context"
import { back } from "@/lib/url"

export async function createOrg(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login")
  const t = await getT()
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  if (!name) back("/onboarding", { error: t("onboarding.nameRequired") })
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) back("/onboarding", { error: t("onboarding.addressInvalid") })

  const { data, error } = await session.supabase.rpc("create_org", {
    p_name: name,
    p_slug: slug,
    p_role_names: [t("roles.defaults.owner"), t("roles.defaults.admin"), t("roles.defaults.member"), t("roles.defaults.doorStaff")],
  })
  if (error) back("/onboarding", { error: error.code === "23505" ? t("onboarding.addressTaken") : dbError(t, error) })
  ;(await cookies()).set(ACTIVE_ORG_COOKIE, data!, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  redirect("/")
}
