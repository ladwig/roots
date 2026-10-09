import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ExternalLinkIcon, ScanLineIcon } from "lucide-react"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { toLocalInput } from "@/lib/time"
import { pageParam, param, siteUrl, withParams } from "@/lib/url"
import { priceInput } from "@/tickets/price"
import { deleteTicketType, saveTicketSettings, saveTicketType } from "./actions"

type TicketType = Tables<"ticket_types">
const STATUSES = ["valid", "used", "reserved", "void"] as const

export default async function EventTickets({ params, searchParams }: PageProps<"/events/[eventId]/tickets">) {
  const ctx = await requirePerm("tickets.view")
  if (!ctx.modules.has("tickets")) notFound()
  const { eventId } = await params
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("tickets.manage")
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const page = pageParam(sp)

  let list = ctx.supabase
    .from("tickets")
    .select("id, code, holder_name, status, created_at, checked_in_at, ticket_types(name), pay_orders(customer_email, customer_name)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  list = status ? list.eq("status", status) : list.neq("status", "reserved")
  if (q) list = list.or(`code.ilike.%${q}%,holder_name.ilike.%${q}%`)
  const [{ data: ev }, { data: types }, { data: tickets }, { data: avail }, { data: counts }] = await Promise.all([
    ctx.supabase.from("events").select("id, title, slug, status, starts_at, ticket_names, max_tickets_per_order").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("ticket_types").select("*").eq("event_id", eventId).order("position").order("price"),
    list,
    ctx.supabase.rpc("ticket_availability", { p_event: eventId }),
    ctx.supabase.from("tickets").select("type_id, status").eq("event_id", eventId).in("status", ["valid", "used"]),
  ])
  if (!ev) notFound()
  const sold = (typeId?: string) => counts?.filter((c) => !typeId || c.type_id === typeId).length ?? 0
  const checkedIn = counts?.filter((c) => c.status === "used").length ?? 0
  const left = new Map(avail?.map((a) => [a.type_id, a.remaining]))
  const editing = types?.find((ty) => ty.id === param(sp, "edit"))
  const creating = canManage && param(sp, "new") === "type"
  const rows = tickets?.slice(0, PAGE_SIZE) ?? []

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="grid gap-1">
        <Link href={`/events?edit=${ev.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {ev.title}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold">{t("tickets.title")}</h1>
          <div className="flex flex-wrap gap-2">
            {ctx.can("tickets.scan") && (
              <Button render={<Link href={`/scan?event=${ev.id}`} />} nativeButton={false} size="sm" variant="outline">
                <ScanLineIcon /> {t("tickets.scan")}
              </Button>
            )}
            {ev.status === "published" && (
              <Button render={<a href={siteUrl(ctx.org.slug, `/e/${ev.slug}`)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
                {t("tickets.shop")} <ExternalLinkIcon />
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("tickets.summary", { sold: sold(), checkedIn })}</p>
      </div>
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {ev.status !== "published" && <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("tickets.notPublished")}</p>}

      <section className="grid gap-3" aria-labelledby="types">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="types" className="font-medium">
            {t("tickets.types")}
          </h2>
          {canManage && (
            <Button render={<Link href={withParams(sp, { new: "type", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
              {t("tickets.newType")}
            </Button>
          )}
        </div>
        <DataTable
          rows={types ?? []}
          rowKey={(ty) => ty.id}
          rowHref={canManage ? (ty) => withParams(sp, { edit: ty.id, new: undefined }) : undefined}
          empty={t("tickets.noTypes")}
          columns={[
            {
              header: t("tickets.typeName"),
              cell: (ty) => (
                <span className="font-medium">
                  {ty.name} {!ty.active && <Badge variant="secondary">{t("tickets.inactive")}</Badge>}
                </span>
              ),
            },
            { header: t("tickets.price"), cell: (ty) => (ty.price === 0 ? t("shop.free") : t.money(ty.price, ty.currency)) },
            { header: t("tickets.sold"), cell: (ty) => `${sold(ty.id)}${ty.quota ? ` / ${ty.quota}` : ""}`, className: "tabular-nums" },
            {
              header: t("tickets.left"),
              cell: (ty) => (left.get(ty.id) == null ? "∞" : String(left.get(ty.id))),
              className: "tabular-nums",
            },
            {
              header: t("tickets.window"),
              cell: (ty) =>
                ty.sales_start || ty.sales_end ? (
                  <span className="text-xs text-muted-foreground">
                    {ty.sales_start ? t.date(ty.sales_start, { dateStyle: "short", timeStyle: "short" }) : "…"} –{" "}
                    {ty.sales_end ? t.date(ty.sales_end, { dateStyle: "short", timeStyle: "short" }) : "…"}
                  </span>
                ) : null,
            },
          ]}
        />
      </section>

      {canManage && (
        <form action={saveTicketSettings} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="event" value={ev.id} />
          <div className="grid gap-2">
            <Label htmlFor="t-names">{t("tickets.names")}</Label>
            <NativeSelect id="t-names" name="ticket_names" defaultValue={ev.ticket_names} className="w-full">
              {(["off", "optional", "required"] as const).map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {t.dynamic(`tickets.namesMode.${n}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-max">{t("tickets.maxPerOrder")}</Label>
            <Input id="t-max" name="max_tickets_per_order" type="number" min={1} max={100} defaultValue={ev.max_tickets_per_order} />
          </div>
          <Button type="submit" variant="outline">
            {t("common.save")}
          </Button>
        </form>
      )}

      <section className="grid gap-3" aria-labelledby="sold">
        <h2 id="sold" className="font-medium">
          {t("tickets.soldTickets")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox q={q} label={t("tickets.search")} />
          <nav aria-label={t("tickets.status")} className="flex flex-wrap gap-1.5">
            {[undefined, ...STATUSES].map((s) => (
              <Link
                key={s ?? "all"}
                href={withParams(sp, { status: s, page: undefined })}
                aria-current={s === status ? "true" : undefined}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
              >
                {s ? t.dynamic(`tickets.statuses.${s}`) : t("tickets.allSold")}
              </Link>
            ))}
          </nav>
        </div>
        <DataTable
          rows={rows}
          rowKey={(k) => k.id}
          empty={t("tickets.noTickets")}
          columns={[
            { header: t("tickets.code"), cell: (k) => <span className="font-mono">{k.code}</span> },
            { header: t("tickets.typeName"), cell: (k) => k.ticket_types?.name },
            { header: t("tickets.holder"), cell: (k) => k.holder_name ?? k.pay_orders?.customer_name },
            { header: t("tickets.buyer"), cell: (k) => <span className="break-all">{k.pay_orders?.customer_email}</span> },
            {
              header: t("tickets.status"),
              cell: (k) => (
                <Badge variant={k.status === "valid" ? "default" : k.status === "used" ? "secondary" : "outline"}>{t.dynamic(`tickets.statuses.${k.status}`)}</Badge>
              ),
            },
          ]}
        />
        <Pager sp={sp} page={page} hasNext={(tickets?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      </section>

      {creating && (
        <UrlSheet params={["new"]} title={t("tickets.newType")}>
          <Notice error={param(sp, "error")} />
          <TypeForm t={t} eventId={ev.id} />
        </UrlSheet>
      )}
      {canManage && editing && (
        <UrlSheet params={["edit"]} title={editing.name}>
          <Notice error={param(sp, "error")} />
          <TypeForm t={t} eventId={ev.id} ty={editing} />
          <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
            <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
            <p className="text-sm text-muted-foreground">{t("tickets.deleteHint")}</p>
            <form action={deleteTicketType}>
              <input type="hidden" name="event" value={ev.id} />
              <input type="hidden" name="id" value={editing.id} />
              <Button type="submit" variant="outline" size="sm">
                {t("tickets.deleteType")}
              </Button>
            </form>
          </section>
        </UrlSheet>
      )}
    </div>
  )
}

function TypeForm({ t, eventId, ty }: { t: T; eventId: string; ty?: TicketType }) {
  return (
    <form action={saveTicketType} className="grid gap-4">
      <input type="hidden" name="event" value={eventId} />
      {ty && <input type="hidden" name="id" value={ty.id} />}
      <div className="grid gap-2">
        <Label htmlFor="ty-name">{t("tickets.typeName")}</Label>
        <Input id="ty-name" name="name" defaultValue={ty?.name} required maxLength={100} placeholder={t("tickets.typeNamePlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ty-price">{t("tickets.priceEur")}</Label>
          <Input id="ty-price" name="price" inputMode="decimal" defaultValue={ty ? priceInput(ty.price) : ""} required placeholder="12,50" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ty-quota">{t("tickets.quota")}</Label>
          <Input id="ty-quota" name="quota" type="number" min={1} defaultValue={ty?.quota ?? ""} placeholder="∞" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ty-start">{t("tickets.salesStart")}</Label>
          <Input id="ty-start" name="sales_start" type="datetime-local" defaultValue={ty?.sales_start ? toLocalInput(ty.sales_start) : undefined} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ty-end">{t("tickets.salesEnd")}</Label>
          <Input id="ty-end" name="sales_end" type="datetime-local" defaultValue={ty?.sales_end ? toLocalInput(ty.sales_end) : undefined} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ty-desc">{t("tickets.typeDescription")}</Label>
        <Input id="ty-desc" name="description" defaultValue={ty?.description ?? ""} maxLength={1000} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="hidden" name="active" value="0" />
        <input type="checkbox" name="active" value="1" defaultChecked={ty?.active ?? true} className="size-4" />
        {t("tickets.activeLabel")}
      </label>
      <Button type="submit" className="justify-self-start">
        {ty ? t("common.save") : t("tickets.newType")}
      </Button>
    </form>
  )
}

export const instant = false
