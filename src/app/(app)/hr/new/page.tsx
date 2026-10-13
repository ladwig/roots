import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { EmployeeForm } from "../employee-form"

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("hr.manage")
  const t = await getT()
  const sp = await searchParams
  const [{ data: people }, { data: orgMembers }] = await Promise.all([
    ctx.supabase.from("employees").select("id, name, user_id").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(500),
    ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id),
  ])
  // Org members who aren't employees yet (name + email from their profile).
  const free = (orgMembers ?? []).filter((m) => !people?.some((p) => p.user_id === m.user_id))
  const { data: profiles } = free.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", free.map((m) => m.user_id)) : { data: [] }
  const members = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name ? `${p.full_name} · ${p.email}` : p.email })).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <NewPage list={{ href: "/hr", label: t("hr.nav") }} title={t("hr.new")} error={param(sp, "error")}>
      <EmployeeForm t={t} managers={people ?? []} members={members} />
    </NewPage>
  )
}

export const instant = false
