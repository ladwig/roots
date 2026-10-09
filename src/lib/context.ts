import { cache } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { createClient } from "@/lib/supabase/server"

export const ACTIVE_ORG_COOKIE = "active_org"
export const setActiveOrg = async (orgId: string) =>
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })

type Role = { name: string; is_owner: boolean; permissions: string[] }
type Org = { id: string; name: string; slug: string }

// Mirrors public.has_perm() for hiding UI. The database is the real check.
export const roleHas = (role: Role, perm: string) =>
  role.is_owner ||
  role.permissions.some((p) => p === "*" || p === perm || p === `${perm.split(".")[0]}.*`)

export const getSession = cache(async () => {
  await connection() // session checks read the clock (token expiry): always request-time
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return null
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin")
  return { supabase, userId: data.claims.sub, email: data.claims.email ?? "", isPlatformAdmin: !!isPlatformAdmin }
})

// Signed-in user + active org; `supabase` is scoped to that org via the x-org-id header. Redirects to /login, /onboarding (or /admin for platform admins without orgs).
export const getContext = cache(async () => {
  const session = await getSession()
  if (!session) redirect("/login")
  const { supabase, userId, isPlatformAdmin } = session

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, orgs(id, name, slug), roles(name, is_owner, permissions)")
    .eq("user_id", userId)
    .order("created_at")
  const orgs: Org[] = memberships?.map((m) => m.orgs!) ?? []
  const active = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value

  const t = await getT()
  const toRole = (r: { name: unknown; is_owner: boolean; permissions: string[] } | null | undefined): Role | undefined =>
    r ? { ...r, name: t.pick(r.name) } : undefined

  let current = memberships?.find((m) => m.org_id === active)
  let org = current?.orgs ?? undefined
  let role = toRole(current?.roles)
  let viaPlatform = false

  // Platform admins can open any org; they act with full rights there.
  if (!current && active && isPlatformAdmin) {
    const { data } = await supabase.from("orgs").select("id, name, slug").eq("id", active).maybeSingle()
    if (data) {
      org = data
      role = { name: t("admin.roleName"), is_owner: true, permissions: [] }
      viaPlatform = true
      orgs.push(data)
    }
  }
  if (!org) {
    current = memberships?.[0]
    org = current?.orgs ?? undefined
    role = toRole(current?.roles)
  }
  if (!org || !role) redirect(isPlatformAdmin ? "/admin" : "/onboarding")

  // From here on, every query is scoped to the active org by the database.
  const scoped = await createClient(org.id)
  const { data: mods } = await scoped.from("org_modules").select("module_key").eq("org_id", org.id)
  const r = role
  return {
    ...session,
    supabase: scoped,
    orgs,
    org,
    role: r,
    viaPlatform,
    modules: new Set(mods?.map((m) => m.module_key)),
    can: (perm: string) => roleHas(r, perm),
  }
})

export async function requirePerm(perm: string) {
  const ctx = await getContext()
  if (!ctx.can(perm)) notFound()
  return ctx
}

export async function requirePlatformAdmin() {
  const session = await getSession()
  if (!session) redirect("/login?next=/admin")
  if (!session.isPlatformAdmin) notFound()
  return session
}
