"use server"

import { redirect } from "next/navigation"
import { setActiveOrg, getContext } from "@/lib/context"

export async function switchOrg(orgId: string) {
  const ctx = await getContext()
  if (!ctx.orgs.some((o) => o.id === orgId)) return
  await setActiveOrg(orgId)
  redirect("/")
}
