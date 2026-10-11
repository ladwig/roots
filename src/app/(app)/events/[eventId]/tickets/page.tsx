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
import { deleteCode, deleteTicketType, deleteTier, saveCode, saveTicketSettings, saveTicketType, saveTier } from "./actions"
import { SubmitButton } from "@/components/submit-button"

type TicketType = Tables<"ticket_types">
type Tier = Tables<"ticket_tiers">
type Code = Tables<"ticket_codes">
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
  const [{ data: ev }, { data: types }, { data: tickets }, { data: avail }, { data: counts }, { data: tiers }, { data: codes }] =
    await Promise.all([
      ctx.supabase
        .from("events")
        .select("id, title, slug, status, starts_at, ticket_names, max_tickets_per_order")
        .eq("id", eventId)
        .eq("org_id", ctx.org.id)
        .maybeSingle(),
      ctx.supabase.from("ticket_types").select("*").eq("event_id", eventId).order("position").order("price"),
      list,
      ctx.supabase.rpc("ticket_availability", { p_event: eventId }),
      ctx.supabase.from("tickets").select("type_id, tier_id, code_id, status").eq("event_id", eventId).in("status", ["valid", "used"]),
      ctx.supabase
        .from("ticket_tiers")
        .select("*, ticket_types!inner(event_id)")
        .eq("ticket_types.event_id", eventId)
        .order("position")
        .order("created_at"),
      ctx.supabase.from("ticket_codes").select("*").eq("event_id", eventId).order("created_at"),
    ])
  if (!ev) notFound()
  const sold = (typeId?: string) => counts?.filter((c) => !typeId || c.type_id === typeId).length ?? 0
  const checkedIn = counts?.filter((c) => c.status === "used").length ?? 0
  const left = new Map(avail?.map((a) => [a.type_id, a.remaining]))
  const editing = types?.find((ty) => ty.id === param(sp, "edit"))
  const creating = canManage && param(sp, "new") === "type"
  const creatingCode = canManage && param(sp, "new") === "code"
  const editingCode = codes?.find((c) => c.id === param(sp, "code"))
  const used = (key: "tier_id" | "code_id", id: string) => counts?.filter((c) => c[key] === id).length ?? 0
  const shopUrl = siteUrl(ctx.org.slug, `/e/${ev?.slug}`)
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
              <Button
                render={<a href={siteUrl(ctx.org.slug, `/e/${ev.slug}`)} target="_blank" rel="noreferrer" />}
                nativeButton={false}
                size="sm"
                variant="outline"
              >
                {t("tickets.shop")} <ExternalLinkIcon />
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("tickets.summary", { sold: sold(), checkedIn })}</p>
      </div>
      <Notice error={!editing && !creating && !editingCode && !creatingCode ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
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
                  {ty.name} {!ty.active && <Badge variant="secondary">{t("tickets.inactive")}</Badge>}{" "}
                  {ty.hidden && <Badge variant="outline">{t("tickets.hiddenBadge")}</Badge>}
                  {(tiers?.filter((r) => r.type_id === ty.id).length ?? 0) > 0 && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {tiers!
                        .filter((r) => r.type_id === ty.id)
                        .map((r) => r.name)
                        .join(" → ")}
                    </span>
                  )}
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

      <section className="grid gap-3" aria-labelledby="codes">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="codes" className="font-medium">
            {t("tickets.codes")}
          </h2>
          {canManage && (
            <Button
              render={<Link href={withParams(sp, { new: "code", code: undefined, edit: undefined })} scroll={false} />}
              nativeButton={false}
              size="sm"
              variant="outline"
            >
              {t("tickets.newCode")}
            </Button>
          )}
        </div>
        <DataTable
          rows={codes ?? []}
          rowKey={(c) => c.id}
          rowHref={canManage ? (c) => withParams(sp, { code: c.id, new: undefined, edit: undefined }) : undefined}
          empty={t("tickets.noCodes")}
          columns={[
            { header: t("tickets.code"), cell: (c) => <span className="font-mono">{c.code}</span> },
            {
              header: t("tickets.discount"),
              cell: (c) =>
                c.kind === "percent" ? `−${c.value} %` : c.kind === "amount" ? `−${t.money(c.value, "eur")}` : t("tickets.unlockOnly"),
            },
            {
              header: t("tickets.uses"),
              cell: (c) => `${used("code_id", c.id)}${c.max_uses ? ` / ${c.max_uses}` : ""}`,
              className: "tabular-nums",
            },
            {
              header: t("tickets.link"),
              cell: (c) => <span className="text-xs break-all text-muted-foreground">{`${shopUrl}?code=${c.code}`}</span>,
            },
            { header: t("tickets.status"), cell: (c) => (c.active ? null : <Badge variant="secondary">{t("tickets.inactive")}</Badge>) },
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
          <SubmitButton variant="outline">
            {t("common.save")}
          </SubmitButton>
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
                <Badge variant={k.status === "valid" ? "default" : k.status === "used" ? "secondary" : "outline"}>
                  {t.dynamic(`tickets.statuses.${k.status}`)}
                </Badge>
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
          <TierList
            t={t}
            eventId={ev.id}
            typeId={editing.id}
            tiers={tiers?.filter((r) => r.type_id === editing.id) ?? []}
            used={(id) => used("tier_id", id)}
          />
          <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
            <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
            <p className="text-sm text-muted-foreground">{t("tickets.deleteHint")}</p>
            <form action={deleteTicketType}>
              <input type="hidden" name="event" value={ev.id} />
              <input type="hidden" name="id" value={editing.id} />
              <SubmitButton variant="outline" size="sm">
                {t("tickets.deleteType")}
              </SubmitButton>
            </form>
          </section>
        </UrlSheet>
      )}
      {(creatingCode || (canManage && editingCode)) && (
        <UrlSheet params={["new", "code"]} title={editingCode ? editingCode.code : t("tickets.newCode")}>
          <Notice error={param(sp, "error")} />
          <CodeForm t={t} eventId={ev.id} c={editingCode} types={types ?? []} />
          {editingCode && (
            <>
              <p className="text-sm">
                {t("tickets.link")}: <span className="break-all font-mono text-xs">{`${shopUrl}?code=${editingCode.code}`}</span>
              </p>
              <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
                <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
                <form action={deleteCode}>
                  <input type="hidden" name="event" value={ev.id} />
                  <input type="hidden" name="id" value={editingCode.id} />
                  <SubmitButton variant="outline" size="sm">
                    {t("tickets.deleteCode")}
                  </SubmitButton>
                </form>
              </section>
            </>
          )}
        </UrlSheet>
      )}
    </div>
  )
}

function TierList({
  t,
  eventId,
  typeId,
  tiers,
  used,
}: {
  t: T
  eventId: string
  typeId: string
  tiers: Tier[]
  used: (id: string) => number
}) {
  const row = (r?: Tier) => (
    <form key={r?.id ?? "new"} action={saveTier} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
      <input type="hidden" name="event" value={eventId} />
      <input type="hidden" name="type" value={typeId} />
      {r && <input type="hidden" name="id" value={r.id} />}
      <Input
        name="name"
        defaultValue={r?.name}
        required
        maxLength={100}
        placeholder={t("tickets.tierNamePlaceholder")}
        aria-label={t("tickets.tierName")}
      />
      <Input
        name="price"
        defaultValue={r ? priceInput(r.price) : ""}
        required
        inputMode="decimal"
        placeholder={t("tickets.priceEur")}
        aria-label={t("tickets.priceEur")}
      />
      <Input
        name="quota"
        type="number"
        min={1}
        defaultValue={r?.quota ?? ""}
        placeholder={t("tickets.tierQuota")}
        aria-label={t("tickets.tierQuota")}
      />
      <Input
        name="sales_end"
        type="datetime-local"
        defaultValue={r?.sales_end ? toLocalInput(r.sales_end) : undefined}
        aria-label={t("tickets.tierEnd")}
      />
      <Input
        name="position"
        type="number"
        defaultValue={r?.position ?? tiers.length}
        aria-label={t("tickets.tierPosition")}
        className="sm:w-24"
      />
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {r && <span className="text-xs text-muted-foreground">{t("tickets.tierSold", { count: used(r.id) })}</span>}
        <SubmitButton size="sm" variant={r ? "outline" : "default"}>
          {r ? t("common.save") : t("tickets.addTier")}
        </SubmitButton>
        {r && (
          <SubmitButton size="sm" variant="ghost" formAction={deleteTier}>
            {t("tickets.deleteTier")}
          </SubmitButton>
        )}
      </div>
    </form>
  )
  return (
    <section className="grid gap-3" aria-labelledby="tiers">
      <h3 id="tiers" className="font-medium">
        {t("tickets.tiers")}
      </h3>
      <p className="text-sm text-muted-foreground">{t("tickets.tiersHint")}</p>
      {tiers.map((r) => row(r))}
      {row()}
    </section>
  )
}

function CodeForm({ t, eventId, c, types }: { t: T; eventId: string; c?: Code; types: TicketType[] }) {
  return (
    <form action={saveCode} className="grid gap-4">
      <input type="hidden" name="event" value={eventId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-2">
        <Label htmlFor="c-code">{t("tickets.code")}</Label>
        <Input
          id="c-code"
          name="code"
          defaultValue={c?.code}
          required
          maxLength={40}
          placeholder="CREW-2026"
          className="font-mono uppercase"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="c-kind">{t("tickets.discount")}</Label>
          <NativeSelect id="c-kind" name="kind" defaultValue={c?.kind ?? "percent"} className="w-full">
            {(["percent", "amount", "none"] as const).map((k) => (
              <NativeSelectOption key={k} value={k}>
                {t.dynamic(`tickets.kinds.${k}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-value">{t("tickets.codeValueLabel")}</Label>
          <Input
            id="c-value"
            name="value"
            inputMode="decimal"
            defaultValue={c ? (c.kind === "amount" ? priceInput(c.value) : String(c.value)) : ""}
            placeholder="20"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="c-max">{t("tickets.maxUses")}</Label>
          <Input id="c-max" name="max_uses" type="number" min={1} defaultValue={c?.max_uses ?? ""} placeholder="∞" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-from">{t("tickets.validFrom")}</Label>
          <Input
            id="c-from"
            name="valid_from"
            type="datetime-local"
            defaultValue={c?.valid_from ? toLocalInput(c.valid_from) : undefined}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-until">{t("tickets.validUntil")}</Label>
          <Input
            id="c-until"
            name="valid_until"
            type="datetime-local"
            defaultValue={c?.valid_until ? toLocalInput(c.valid_until) : undefined}
          />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("tickets.codeTypes")}</legend>
        {types.map((ty) => (
          <label key={ty.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="type_ids" value={ty.id} defaultChecked={c?.type_ids.includes(ty.id)} className="size-4" />
            {ty.name} {ty.hidden && <Badge variant="outline">{t("tickets.hiddenBadge")}</Badge>}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t("tickets.codeTypesHint")}</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={c?.active ?? true} className="size-4" />
        {t("tickets.codeActive")}
      </label>
      <SubmitButton className="justify-self-start">
        {c ? t("common.save") : t("tickets.newCode")}
      </SubmitButton>
    </form>
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
          <Input
            id="ty-price"
            name="price"
            inputMode="decimal"
            defaultValue={ty ? priceInput(ty.price) : ""}
            required
            placeholder="12,50"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ty-quota">{t("tickets.quota")}</Label>
          <Input id="ty-quota" name="quota" type="number" min={1} defaultValue={ty?.quota ?? ""} placeholder="∞" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ty-start">{t("tickets.salesStart")}</Label>
          <Input
            id="ty-start"
            name="sales_start"
            type="datetime-local"
            defaultValue={ty?.sales_start ? toLocalInput(ty.sales_start) : undefined}
          />
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
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="hidden" value="1" defaultChecked={ty?.hidden} className="mt-0.5 size-4" />
        <span>
          {t("tickets.hiddenLabel")}
          <span className="block text-xs text-muted-foreground">{t("tickets.hiddenHint")}</span>
        </span>
      </label>
      <SubmitButton className="justify-self-start">
        {ty ? t("common.save") : t("tickets.newType")}
      </SubmitButton>
    </form>
  )
}

export const instant = false
