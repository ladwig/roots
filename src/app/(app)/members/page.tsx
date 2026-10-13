import { redirect } from "next/navigation"
import Link from "next/link"
import { UploadIcon } from "lucide-react"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { ContactPicker } from "@/components/contact-picker"
import { ExportMenu } from "@/components/export-menu"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { isPaused } from "@/members/dues"
import { loadFields } from "@/lib/custom-fields"
import { Field, MembershipFields, TYPE_COLS } from "./membership-parts"
import { saveMembership } from "./actions"

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
  const creating = canManage && param(sp, "new") === "1"
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
  const [{ data }, { data: types }, { count: activeCount }, { data: preset }, defs] = await Promise.all([
    query,
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null).lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`),
    creating && param(sp, "contact")
      ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", param(sp, "contact")!).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    creating ? loadFields(ctx.supabase, ctx.org.id, "memberships") : [],
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const typeName = (id: string) => types?.find((x) => x.id === id)?.name ?? ""
  const chip = (href: string, current: boolean, label: string) => (
    <Link
      key={label}
      href={href}
      aria-current={current ? "true" : undefined}
      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("membership.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("membership.activeCount", { count: activeCount ?? 0 })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu entity="members" query={{ status, type: typeFilter, q }} />
          {canManage && ctx.can("crm.manage") && (
            <Button render={<Link href="/members/import" />} nativeButton={false} size="sm" variant="outline">
              <UploadIcon /> {t("membership.import")}
            </Button>
          )}
          {canManage && (
            <Button render={<Link href={withParams(sp, { new: "1", edit: undefined })} scroll={false} />} nativeButton={false} size="sm" disabled={!types?.length}>
              {t("membership.new")}
            </Button>
          )}
        </div>
      </div>
      <Notice error={!creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {!types?.length && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("membership.noTypes")}{" "}
          {canManage && (
            <Link href="/members/setup" className="underline">
              {t("membership.tabs.setup")}
            </Link>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} keep={{ ...(status !== "active" && { status }), ...(typeFilter && { type: typeFilter }) }} />
        <nav aria-label={t("membership.filter")} className="flex flex-wrap gap-1.5">
          {(["active", "ended", "all", ...(canManage ? (["trash"] as const) : [])] as const).map((s) =>
            chip(withParams(sp, { status: s === "active" ? undefined : s, page: undefined, edit: undefined }), s === status, t(`membership.filters.${s}`)),
          )}
          {(types ?? []).map((x) => chip(withParams(sp, { type: x.id === typeFilter ? undefined : x.id, page: undefined, edit: undefined }), x.id === typeFilter, x.name))}
        </nav>
      </div>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/members/${r.id}`}
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

      {creating && (
        <UrlSheet params={["new"]} title={t("membership.new")}>
          <Notice error={param(sp, "error")} />
          <form action={saveMembership} className="grid gap-4">
            <fieldset className="grid gap-4">
              <legend className="mb-2 font-medium">{t("membership.person")}</legend>
              <ContactPicker
                name="contact_id"
                label={t("membership.existingContact")}
                initial={preset ? { id: preset.id, label: contactName(preset), detail: preset.email ?? "" } : null}
              />
              <p className="text-xs text-muted-foreground">{t("membership.newContactHint")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="m-first" name="first_name" label={t("contacts.firstName")} maxLength={100} autoComplete="off" />
                <Field id="m-last" name="last_name" label={t("contacts.lastName")} maxLength={100} autoComplete="off" />
              </div>
              <Field id="m-email" name="email" type="email" label={t("contacts.email")} maxLength={320} autoComplete="off" />
            </fieldset>
            <Separator />
            <MembershipFields t={t} types={types ?? []} defs={defs} />
            <SubmitButton className="justify-self-start">{t("membership.create")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false
