import { DownloadIcon, KeyRoundIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { Button } from "@/components/ui/button"
import { BulkBar } from "@/components/bulk-bar"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { FAMILIES } from "@/rentals/fields"
import { bulkTrashRentals, restoreRentalAction } from "../actions"
import { kindLabel, peopleLine, period, StateBadge } from "../parts"

const VIEWS = ["current", "upcoming", "requests", "ended", "all"] as const

// All rentals (contracts, bookings, loans, handouts) across objects: what runs now, what's planned, open requests.
export default async function RentalListPage({ searchParams }: PageProps<"/rentals/list">) {
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("rentals.manage")
  const trash = canManage && param(sp, "view") === "trash"
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "current"
  const family = FAMILIES.find((f) => f === param(sp, "family"))
  const page = pageParam(sp)
  const now = new Date().toISOString()
  let query = ctx.supabase
    .from("rentals")
    .select("id, status, starts_at, ends_at, price_cents, unit, deleted_at, rental_objects!inner(id, name, kind, family), rental_contacts(role, contacts(first_name, last_name, company, email))")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null)
  if (family) query = query.eq("rental_objects.family", family)
  if (trash) {
    // trash: no time filter
  } else if (view === "current") query = query.eq("status", "confirmed").lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false })
  else if (view === "upcoming") query = query.eq("status", "confirmed").gt("starts_at", now).order("starts_at")
  else if (view === "requests") query = query.eq("status", "request").order("starts_at")
  else if (view === "ended") query = query.lte("ends_at", now).order("ends_at", { ascending: false })
  else if (view === "all") query = query.order("starts_at", { ascending: false })
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []

  return (
    <Page>
      <PageHeader
        area="rentals"
        title={trash ? `${t("rentals.tabs.rentals")} · ${t("rentals.trash")}` : t("rentals.tabs.rentals")}
        menu={
          <ActionsMenu>
            <MenuExport entity="rentals" query={{ view, family }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/rentals/list" : "/rentals/list?view=trash"} icon={trash ? <KeyRoundIcon /> : <Trash2Icon />}>
                  {trash ? t("rentals.views.current") : t("rentals.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
      />
      {trash && <p className="text-sm text-muted-foreground">{t("rentals.trashHint", { days: 30 })}</p>}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div hidden={trash} className="flex flex-wrap items-center gap-2">
        <Segments label={t("rentals.stateCol")} items={VIEWS.map((v) => ({ href: withParams(sp, { view: v === "current" ? undefined : v, page: undefined }), current: v === view, label: t.dynamic(`rentals.views.${v}`) }))} />
        <FilterMenu param="family" label={t("rentals.filterFamily")} options={FAMILIES.map((f) => ({ value: f, label: t.dynamic(`rentals.families.${f}`) }))} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={trash ? undefined : (r) => `/rentals/r/${r.id}`}
        select={canManage && !trash ? { form: "bulk-rentals", label: t("common.select") } : undefined}
        empty={t("rentals.listEmpty")}
        columns={[
          {
            header: t("rentals.object"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.rental_objects.name}</span>
                <span className="text-xs text-muted-foreground">{kindLabel(t, r.rental_objects.kind)}</span>
              </span>
            ),
          },
          { header: t("rentals.whoCol"), cell: (r) => peopleLine(r.rental_contacts) || "–" },
          { header: t("rentals.whenCol"), cell: (r) => period(t, r) },
          { header: t("rentals.priceCol"), cell: (r) => (r.price_cents != null && r.unit ? `${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}` : ""), className: "whitespace-nowrap" },
          {
            header: t("rentals.stateCol"),
            cell: (r) =>
              r.deleted_at ? (
                <form action={restoreRentalAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="xs" variant="outline">
                    {t("rentals.restore")}
                  </SubmitButton>
                </form>
              ) : (
                <StateBadge t={t} r={r} />
              ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {canManage && !trash && (
        <BulkBar form="bulk-rentals">
          <input type="hidden" name="back" value={`/rentals/list${withParams(sp, {})}`} />
          <Button type="submit" size="sm" variant="outline" formAction="/export/rentals" formMethod="get" name="format" value="xlsx">
            <DownloadIcon /> {t("common.exportSelected")}
          </Button>
          <SubmitButton size="sm" variant="ghost" formAction={bulkTrashRentals} data-confirm="common.confirmTrashMany" className="text-destructive hover:text-destructive">
            <Trash2Icon /> {t("common.toTrash")}
          </SubmitButton>
        </BulkBar>
      )}
    </Page>
  )
}

export const instant = false
