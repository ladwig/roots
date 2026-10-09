import { cache } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export const ACTIVE_ORG_COOKIE = "active_org"

type Role = { name: string; is_owner: boolean; permissions: string[] }

// Mirrors public.has_perm() for hiding UI. The database is the real check.
export const roleHas = (role: Role, perm: string) =>
  role.is_owner ||
  role.permissions.some((p) => p === "*" || p === perm || p === `${perm.split(".")[0]}.*`)

export const getSession = cache(async () => {
  await connection() // session checks read the clock (token expiry): always request-time
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return null
  return { supabase, userId: data.claims.sub, email: data.claims.email ?? "" }
})

// Signed-in user + active org. Redirects to /login or /onboarding when missing.
export const getContext = cache(async () => {
  const session = await getSession()
  if (!session) redirect("/login")
  const { supabase, userId } = session

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, orgs(id, name, slug), roles(name, is_owner, permissions)")
    .eq("user_id", userId)
    .order("created_at")
  if (!memberships?.length) redirect("/onboarding")

  const active = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value
  const current = memberships.find((m) => m.org_id === active) ?? memberships[0]
  const role = current.roles!
  const { data: mods } = await supabase.from("org_modules").select("module_key").eq("org_id", current.org_id)

  return {
    ...session,
    orgs: memberships.map((m) => m.orgs!),
    org: current.orgs!,
    role,
    modules: new Set(mods?.map((m) => m.module_key)),
    can: (perm: string) => roleHas(role, perm),
  }
})

export async function requirePerm(perm: string) {
  const ctx = await getContext()
  if (!ctx.can(perm)) notFound()
  return ctx
}
