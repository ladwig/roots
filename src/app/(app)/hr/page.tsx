import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { ExportMenu } from "@/components/export-menu"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { EmployeeForm } from "./employee-form"

// Employees: who works here, on what terms. A row opens the person's page.
export default async function HrPage({ searchParams }: PageProps<"/hr">) {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("hr.manage")
  const trash = canManage && param(sp, "status") === "trash"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  let query = ctx.supabase
    .from("employees")
    .select("id, name, job_title, department, employment_type, starts_on, ends_on, manager:manager_id(name)")
    .eq("org_id", ctx.org.id)
    .order("name")
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (q) query = query.or(`name.ilike.%${q}%,job_title.ilike.%${q}%,department.ilike.%${q}%,email.ilike.%${q}%`)
  const creating = canManage && param(sp, "new") === "employee"
  const [{ data }, { data: people }, { data: orgMembers }] = await Promise.all([
    query,
    creating ? ctx.supabase.from("employees").select("id, name, user_id").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(500) : Promise.resolve({ data: null }),
    creating ? ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id) : Promise.resolve({ data: null }),
  ])
  // Org members who aren't employees yet (name + email from their profile).
  const free = (orgMembers ?? []).filter((m) => !people?.some((p) => p.user_id === m.user_id))
  const { data: profiles } = free.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", free.map((m) => m.user_id)) : { data: [] }
  const members = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name ? `${p.full_name} · ${p.email}` : p.email })).sort((a, b) => a.name.localeCompare(b.name))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("hr.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <ExportMenu entity="employees" />
          {canManage && (
            <Button render={<Link href={`/hr${withParams(sp, { new: "employee" })}`} />} nativeButton={false} size="sm">
              <PlusIcon /> {t("hr.new")}
            </Button>
          )}
        </div>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("hr.search")} keep={trash ? { status: "trash" } : undefined} />
        {canManage && (
          <Link href={trash ? "/hr" : "/hr?status=trash"} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            {trash ? t("hr.backToList") : t("hr.trash")}
          </Link>
        )}
      </div>
      <DataTable
        rows={(data ?? []).slice(0, PAGE_SIZE)}
        rowKey={(e) => e.id}
        empty={q ? t("hr.noMatch") : t("hr.empty")}
        columns={[
          {
            header: t("hr.name"),
            cell: (e) => (
              <Link href={`/hr/${e.id}`} className="grid underline-offset-4 hover:underline">
                <span className="font-medium">{e.name}</span>
                {e.job_title && <span className="text-xs text-muted-foreground">{e.job_title}</span>}
              </Link>
            ),
          },
          { header: t("hr.employmentType"), cell: (e) => t.dynamic(`hr.types.${e.employment_type}`) },
          { header: t("hr.department"), cell: (e) => e.department ?? "–" },
          { header: t("hr.manager"), cell: (e) => (e.manager as { name: string } | null)?.name ?? "–" },
          {
            header: t("hr.since"),
            cell: (e) => (
              <span className="flex flex-wrap items-center gap-2">
                {e.starts_on ? t.date(e.starts_on, { dateStyle: "medium" }) : "–"}
                {e.ends_on && e.ends_on < today && <Badge variant="secondary">{t("hr.left")}</Badge>}
              </span>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {creating && (
        <UrlSheet params={["new"]} title={t("hr.new")}>
          <Notice error={param(sp, "error")} />
          <EmployeeForm t={t} managers={people ?? []} members={members} />
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
