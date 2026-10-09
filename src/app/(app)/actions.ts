"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ACTIVE_ORG_COOKIE, getContext } from "@/lib/context"

export async function switchOrg(orgId: string) {
  const ctx = await getContext()
  if (!ctx.orgs.some((o) => o.id === orgId)) return
  ;(await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  redirect("/")
}
