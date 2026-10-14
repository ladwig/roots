import { redirect } from "next/navigation"
import Link from "next/link"
import { MemberImportBody } from "./import/body"
import { UrlSheet } from "@/components/url-sheet"
import { DownloadIcon, IdCardIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { BulkBar } from "@/components/bulk-bar"
import { Button } from "@/components/ui/button"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { isPaused } from "@/members/dues"
import { TYPE_COLS } from "./membership-parts"

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("members.manage")
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const status = (["active", "ended", "all", "trash"] as const).find((s) => s === param(sp, "status") && (s !== "trash" || canManage)) ?? "active"
  const typeFilter = param(sp, "type")
  const page = pageParam(sp)
  // Old drawer links (?edit=<id>) → the membership's page.
  const editId = param(sp, "edit")
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) redirect(`/members/${editId}`)
  if (param(sp, "new")) redirect(`/members/new${param(sp, "contact") ? `?contact=${param(sp, "contact")}` : ""}`) // old drawer link
  const now = today()

  let query = ctx.supabase
    .from("memberships")
    .select("id, number, member_no, starts_on, ends_on, paused_from, paused_until, type_id, contacts!inner(first_name, last_name, company, email, user_id)")
    .eq("org_id", ctx.org.id)
    .order("number")
    .range(...pageRange(page))
  query = status === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (status === "active") query = query.or(`ends_on.is.null,ends_on.gte.${now}`)
  if (status === "ended") query = query.lt("ends_on", now)
  if (typeFilter) query = query.eq("type_id", typeFilter)
  if (q) query = query.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${q}%`).join(","), { referencedTable: "contacts" })
  const [{ data }, { data: types }, { count: activeCount }] = await Promise.all([
    query,
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null).lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const typeName = (id: string) => types?.find((x) => x.id === id)?.name ?? ""
  const chip = (href: string, current: boolean, label: string) => (
    <Link
      key={label}
      href={href}
      aria-current={current ? "true" : undefined}
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
    >
      {label}
    </Link>
  )
  const state = (m: { starts_on: string; ends_on: string | null; paused_from: string | null; paused_until: string | null }) =>
    m.ends_on && m.ends_on < now ? (
      <Badge variant="outline">{t("membership.state.ended")}</Badge>
    ) : isPaused(m, now) ? (
      <Badge variant="secondary">{m.paused_until ? t("membership.state.pausedUntil", { date: t.date(m.paused_until) }) : t("membership.state.paused")}</Badge>
    ) : m.ends_on ? (
      <Badge variant="secondary">{t("membership.state.ending", { date: t.date(m.ends_on) })}</Badge>
    ) : m.starts_on > now ? (
      <Badge variant="secondary">{t("membership.state.upcoming", { date: t.date(m.starts_on) })}</Badge>
    ) : (
      <Badge>{t("membership.state.active")}</Badge>
    )

  return (
    <>
      <PageHeader
        area="members"
        title={status === "trash" ? `${t("membership.tabs.members")} · ${t("membership.filters.trash")}` : t("membership.tabs.members")}
        meta={t("membership.activeCount", { count: activeCount ?? 0 })}
        settings={canManage && { href: "/members/settings", label: t("common.settings") }}
        menu={
          <ActionsMenu>
            {canManage && ctx.can("crm.manage") && (
              <MenuLink href={withParams(sp, { import: "1" })} icon={<UploadIcon />}>
                {t("membership.import")}
              </MenuLink>
            )}
            <MenuExport entity="members" query={{ status, type: typeFilter, q }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={status === "trash" ? "/members" : "/members?status=trash"} icon={status === "trash" ? <IdCardIcon /> : <Trash2Icon />}>
                  {status === "trash" ? t("membership.filters.active") : t("membership.filters.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
        primary={canManage && !!types?.length && status !== "trash" ? { href: "/members/new", label: t("membership.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {!types?.length && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("membership.noTypes")}{" "}
          {canManage && (
            <Link href="/members/types" className="underline">
              {t("membership.types")}
            </Link>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} keep={{ ...(status !== "active" && { status }), ...(typeFilter && { type: typeFilter }) }} />
        <nav aria-label={t("membership.filter")} className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {status !== "trash" &&
            (["active", "ended", "all"] as const).map((s) => chip(withParams(sp, { status: s === "active" ? undefined : s, page: undefined, edit: undefined }), s === status, t(`membership.filters.${s}`)))}
        </nav>
        {(types?.length ?? 0) > 1 && <FilterMenu param="type" label={t("membership.type")} options={(types ?? []).map((x) => ({ value: x.id, label: x.name }))} />}
      </div>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/members/${r.id}`}
        select={status !== "trash" ? { form: "bulk-members", label: t("common.select") } : undefined}
        empty={q || typeFilter ? t("membership.noMatch") : t("membership.empty")}
        columns={[
          {
            header: t("membership.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">
                  {r.contacts ? contactName(r.contacts) : ""}
                  {r.contacts?.user_id && (
                    <Badge variant="outline" className="ml-2">
                      {t("contacts.team.badge")}
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{t("membership.numberShort", { number: r.member_no ?? "" })}</span>
              </span>
            ),
          },
          { header: t("membership.type"), cell: (r) => typeName(r.type_id) },
          { header: t("membership.since"), cell: (r) => t.date(r.starts_on), className: "whitespace-nowrap" },
          { header: t("membership.status"), cell: (r) => state(r) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {status !== "trash" && (
        <BulkBar form="bulk-members">
          <Button type="submit" size="sm" variant="outline" formAction="/export/members" formMethod="get" name="format" value="xlsx">
            <DownloadIcon /> {t("common.exportSelected")}
          </Button>
        </BulkBar>
      )}
      {canManage && ctx.can("crm.manage") && param(sp, "import") === "1" && (
        <UrlSheet params={["import"]} title={t("membership.importTitle")} wide>
          <MemberImportBody ctx={ctx} />
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false
