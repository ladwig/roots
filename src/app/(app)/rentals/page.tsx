import Link from "next/link"
import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { SubmitButton } from "@/components/submit-button"
import { restoreObjectAction } from "./actions"
import { DataTable, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { FAMILIES } from "@/rentals/fields"
import { kindLabel, peopleLine } from "./parts"

const VIEWS = ["all", "free", "busy"] as const

// Objects with what's going on right now: free, or with whom (until when). Without search/family filter only the top
// level (studios, rooms, vehicles…) with a count of what belongs to them; filter "Zugang" lists every key.
export default async function RentalsPage({ searchParams }: PageProps<"/rentals">) {
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("rentals.manage")
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const family = FAMILIES.find((f) => f === param(sp, "family"))
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "all"
  const trash = canManage && param(sp, "trash") === "1"
  const now = new Date().toISOString()

  // ponytail: all objects of the org at once (≤ 1000); paginate when orgs get bigger.
  const [{ data: objects }, { data: running }, { data: rates }] = await Promise.all([
    (trash
      ? ctx.supabase.from("rental_objects").select("id, parent_id, family, kind, name, status, rentable, lendable, included, deleted_at").eq("org_id", ctx.org.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false })
      : ctx.supabase.from("rental_objects").select("id, parent_id, family, kind, name, status, rentable, lendable, included, deleted_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("position").order("name")
    ).limit(1000),
    ctx.supabase
      .from("rentals")
      .select("id, object_id, starts_at, ends_at, rental_contacts(role, contacts(first_name, last_name, company, email))")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .eq("status", "confirmed")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .limit(2000),
    ctx.supabase.from("rental_rates").select("object_id, price_cents, unit").eq("org_id", ctx.org.id).eq("active", true).order("position"),
  ])
  const all = objects ?? []
  const busy = (id: string) => (running ?? []).filter((r) => r.object_id === id)
  const childrenOf = (id: string) => all.filter((o) => o.parent_id === id)
  const nameOf = (id: string | null) => all.find((o) => o.id === id)?.name
  let rows = q || family || trash ? all : all.filter((o) => !o.parent_id || !all.some((p) => p.id === o.parent_id))
  if (q) rows = rows.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
  if (family) rows = rows.filter((o) => o.family === family)
  if (view === "free") rows = rows.filter((o) => !busy(o.id).length && !o.included && o.status === "active")
  if (view === "busy") rows = rows.filter((o) => busy(o.id).length)

  return (
    <Page>
      <PageHeader
        area="rentals"
        title={trash ? `${t("rentals.title")} · ${t("rentals.trash")}` : t("rentals.title")}
        menu={
          <ActionsMenu>
            <MenuExport entity="rental_objects" query={{ family }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/rentals" : "/rentals?trash=1"} icon={trash ? <KeyRoundIcon /> : <Trash2Icon />}>
                  {trash ? t("rentals.all") : t("rentals.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
        primary={canManage && !trash ? { href: "/rentals/new", label: t("rentals.newObject") } : undefined}
      />
      {trash && <p className="text-sm text-muted-foreground">{t("rentals.trashHint", { days: 30 })}</p>}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {all.length > 0 && !trash && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox q={q} label={t("rentals.search")} />
          <FilterMenu param="family" label={t("rentals.filterFamily")} options={FAMILIES.map((f) => ({ value: f, label: t.dynamic(`rentals.families.${f}`) }))} />
          <Segments
            label={t("rentals.status")}
            items={VIEWS.map((v) => ({ href: withParams(sp, { view: v === "all" ? undefined : v }), current: v === view, label: v === "all" ? t("rentals.all") : v === "free" ? t("rentals.onlyFree") : t("rentals.onlyBusy") }))}
          />
        </div>
      )}
      <DataTable
        rows={rows}
        rowKey={(o) => o.id}
        rowHref={trash ? undefined : (o) => `/rentals/${o.id}`}
        empty={
          trash ? (
            t("rentals.emptyTrash")
          ) : all.length ? (
            t("rentals.noMatch")
          ) : (
            <EmptyState
              area="rentals"
              title={t("rentals.empty")}
              text={t("rentals.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/rentals/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("rentals.newObject")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("rentals.name"),
            cell: (o) => (
              <span className="grid">
                <span className="font-medium">{o.name}</span>
                <span className="text-xs text-muted-foreground">
                  {kindLabel(t, o.kind)}
                  {o.parent_id && nameOf(o.parent_id) && ` · ${nameOf(o.parent_id)}`}
                </span>
              </span>
            ),
          },
          {
            header: t("rentals.status"),
            cell: (o) => {
              if (o.deleted_at)
                return (
                  <form action={restoreObjectAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <SubmitButton size="xs" variant="outline">
                      {t("rentals.restore")}
                    </SubmitButton>
                  </form>
                )
              const b = busy(o.id)
              if (o.status !== "active") return <Badge variant="outline">{t.dynamic(`rentals.statuses.${o.status}`)}</Badge>
              if (o.included) return <span className="text-muted-foreground">{t("rentals.includedShort")}</span>
              if (!b.length) return <Badge variant="secondary">{t("rentals.free")}</Badge>
              return (
                <span className="grid">
                  <span>{t("rentals.busyWith", { who: b.map((r) => peopleLine(r.rental_contacts)).filter(Boolean).join(" · ") || "–" })}</span>
                  {b[0].ends_at && <span className="text-xs text-muted-foreground">{t("rentals.until", { date: t.date(b[0].ends_at, { dateStyle: "medium" }) })}</span>}
                </span>
              )
            },
          },
          {
            header: t("rentals.children"),
            cell: (o) => {
              const kids = childrenOf(o.id)
              if (!kids.length) return ""
              const out = kids.filter((k) => busy(k.id).length).length
              return t("rentals.childCount", { count: kids.length, out })
            },
          },
          {
            header: t("rentals.rates"),
            cell: (o) => {
              const r = (rates ?? []).find((x) => x.object_id === o.id)
              return r ? `${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}` : ""
            },
            className: "whitespace-nowrap",
          },
        ]}
      />
    </Page>
  )
}

export const instant = false
