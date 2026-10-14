import { redirect } from "next/navigation"
import { BriefcaseBusinessIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { Page, PageHeader } from "@/components/page"
import Link from "next/link"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param } from "@/lib/url"

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
  if (param(sp, "new")) redirect("/hr/new") // old drawer link
  const { data } = await query
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Page>
      <PageHeader
        area="hr"
        title={trash ? `${t("hr.title")} · ${t("hr.trash")}` : t("hr.title")}
        menu={
          <ActionsMenu>
            <MenuExport entity="employees" />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/hr" : "/hr?status=trash"} icon={trash ? BriefcaseBusinessIcon : Trash2Icon}>
                  {trash ? t("hr.backToList") : t("hr.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
        primary={canManage && !trash ? { href: "/hr/new", label: t("hr.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={q} label={t("hr.search")} keep={trash ? { status: "trash" } : undefined} />
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
    </Page>
  )
}

export const instant = false
