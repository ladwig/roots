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
type Org = { id: string; name: string; slug: string; logo_path: string | null }

// Mirrors public.has_perm() for hiding UI. The database is the real check.
export const roleHas = (role: Role, perm: string) =>
  role.is_owner ||
  role.permissions.some((p) => p === "*" || p === perm || p === `${perm.split(".")[0]}.*`)

const getClaims = cache(async () => {
  await connection() // session checks read the clock (token expiry): always request-time
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims() // verified locally (asymmetric JWT keys), no round trip
  return data?.claims ? { supabase, userId: data.claims.sub, email: data.claims.email ?? "" } : null
})

export const getSession = cache(async () => {
  const c = await getClaims()
  if (!c) return null
  const { data: isPlatformAdmin } = await c.supabase.rpc("is_platform_admin")
  return { ...c, isPlatformAdmin: !!isPlatformAdmin }
})

// Signed-in user + active org; `supabase` is scoped to that org via the x-org-id header. Redirects to /login, /onboarding (or /admin for platform admins without orgs).
export const getContext = cache(async () => {
  const claims = await getClaims()
  if (!claims) redirect("/login")
  // In parallel: admin check + memberships with org, role and the org's modules (no x-org-id yet → all my orgs visible).
  const [session, { data: memberships }] = await Promise.all([
    getSession(),
    claims.supabase
      .from("org_members")
      .select("org_id, orgs(id, name, slug, logo_path, deleted_at, org_modules(module_key)), roles(name, is_owner, permissions)")
      .eq("user_id", claims.userId)
      .order("created_at"),
  ])
  if (!session) redirect("/login")
  const { supabase, isPlatformAdmin } = session
  const live = memberships?.filter((m) => m.orgs && !m.orgs.deleted_at) // deleted orgs: hidden, or in the trash for admins
  const orgs: Org[] = live?.map((m) => ({ id: m.orgs!.id, name: m.orgs!.name, slug: m.orgs!.slug, logo_path: m.orgs!.logo_path })) ?? []
  const active = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value

  const t = await getT()
  const toRole = (r: { name: unknown; is_owner: boolean; permissions: string[] } | null | undefined): Role | undefined =>
    r ? { ...r, name: t.pick(r.name) } : undefined

  let current = live?.find((m) => m.org_id === active)
  let org: Org | undefined = current ? orgs.find((o) => o.id === current!.org_id) : undefined
  let role = toRole(current?.roles)
  let viaPlatform = false
  let platformModules: { module_key: string }[] = []

  // Platform admins can open any org; they act with full rights there.
  if (!current && active && isPlatformAdmin) {
    const { data } = await supabase
      .from("orgs")
      .select("id, name, slug, logo_path, org_modules(module_key)")
      .eq("id", active)
      .is("deleted_at", null)
      .maybeSingle()
    if (data) {
      const { org_modules, ...rest } = data
      org = rest
      platformModules = org_modules
      orgs.push(rest)
      role = { name: t("admin.roleName"), is_owner: true, permissions: [] }
      viaPlatform = true
    }
  }
  if (!org) {
    current = live?.[0]
    org = orgs[0]
    role = toRole(current?.roles)
  }
  if (!org || !role) redirect(isPlatformAdmin ? "/admin" : "/onboarding")

  // From here on, every query is scoped to the active org by the database.
  const scoped = await createClient(org.id)
  const activeOrgId = org.id
  const mods = viaPlatform ? platformModules : (live?.find((m) => m.org_id === activeOrgId)?.orgs?.org_modules ?? [])
  const r = role
  return {
    ...session,
    supabase: scoped,
    orgs,
    org,
    role: r,
    viaPlatform,
    modules: new Set(mods.map((m) => m.module_key)),
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
