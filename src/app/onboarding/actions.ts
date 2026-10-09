"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ACTIVE_ORG_COOKIE, getSession } from "@/lib/context"
import { back } from "@/lib/url"

export async function createOrg(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login")
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  if (!name) back("/onboarding", { error: "Give your organisation a name." })
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug))
    back("/onboarding", { error: "The address needs 3–40 characters: lowercase letters, numbers and dashes." })

  const { data, error } = await session.supabase.rpc("create_org", { p_name: name, p_slug: slug })
  if (error) back("/onboarding", { error: error.code === "23505" ? "That address is already taken." : error.message })
  ;(await cookies()).set(ACTIVE_ORG_COOKIE, data!, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  redirect("/")
}
