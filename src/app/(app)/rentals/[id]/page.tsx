import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRightIcon, FolderPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { ContactPicker } from "@/components/contact-picker"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { formatMoney } from "@/lib/inputs"
import { param, withParams } from "@/lib/url"
import { KINDS, UNITS, longTerm, rentalState, wordFor, type Family } from "@/rentals/fields"
import { OBJECT_COLS, RENTAL_COLS } from "@/rentals/server"
import { addChildrenAction, deleteRateAction, handOutAction, returnAction, saveRateAction, trashObjectAction } from "../actions"
import { kindLabel, ObjectForm, peopleLine, period, StateBadge } from "../parts"

// One object: its rentals (now, planned, earlier), what belongs to it (keys with who has them, rooms, fixtures),
// rates, files; details on the right. Keys are handed out right here (drawer), several added at once.
export default async function ObjectPage({ params, searchParams }: PageProps<"/rentals/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("rentals.manage")
  const [{ data: o }, { data: all }, { data: rates }, { data: rentals }, { data: locations }, defs] = await Promise.all([
    ctx.supabase.from("rental_objects").select(OBJECT_COLS).eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("rental_objects").select("id, name, parent_id, kind, family, status, lendable, rentable, included, deposit_cents").eq("org_id", ctx.org.id).is("deleted_at", null).order("position").order("name").limit(1000),
    ctx.supabase.from("rental_rates").select("*").eq("object_id", id).eq("org_id", ctx.org.id).order("position"),
    ctx.supabase.from("rentals").select(RENTAL_COLS).eq("object_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).order("starts_at", { ascending: false }).limit(200),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "rental_objects"),
  ])
  if (!o || o.deleted_at) notFound()
  const children = (all ?? []).filter((x) => x.parent_id === id)
  const parent = (all ?? []).find((x) => x.id === o.parent_id)
  const now = new Date().toISOString()
  // Who has each child right now (keys, devices), and the running rental of this object (keys hang on it).
  const { data: childRentals } = children.length
    ? await ctx.supabase.from("rentals").select(RENTAL_COLS).in("object_id", children.map((c) => c.id)).eq("org_id", ctx.org.id).is("deleted_at", null).eq("status", "confirmed").lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`)
    : { data: [] }
  const holder = (childId: string) => (childRentals ?? []).find((r) => r.object_id === childId)
  const current = (rentals ?? []).filter((r) => ["running", "upcoming", "request"].includes(rentalState(r)))
  const earlier = (rentals ?? []).filter((r) => !current.includes(r))
  const running = current.find((r) => rentalState(r) === "running")
  const family = o.family as Family
  const firstRate = (rates ?? []).find((r) => r.active)
  const word = wordFor(family, firstRate?.unit)
  const here = `/rentals/${id}`
  const handout = (all ?? []).find((x) => x.id === param(sp, "handout"))
  const rateEdit = param(sp, "rate")
  const rate = (rates ?? []).find((r) => r.id === rateEdit)
  const childKind = family === "place" ? "key" : (KINDS[family][0] ?? "key")

  const rentalRow = (r: NonNullable<typeof rentals>[number]) => (
    <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <Link href={`/rentals/r/${r.id}`} className="grid min-w-0 flex-1 hover:underline">
        <span className="truncate font-medium">{peopleLine(r.rental_contacts, 3) || t("rentals.nobody")}</span>
        <span className="truncate text-xs text-muted-foreground">
          {period(t, r)}
          {r.price_cents != null && r.unit && ` · ${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}`}
        </span>
      </Link>
      <StateBadge t={t} r={r} />
      {canManage && o.lendable && !o.rentable && rentalState(r) === "running" && (
        <form action={returnAction}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={here} />
          <SubmitButton size="xs" variant="outline">
            {t("rentals.giveBack")}
          </SubmitButton>
        </form>
      )}
    </li>
  )

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/rentals", label: t("rentals.nav") }, ...(parent ? [{ href: `/rentals/${parent.id}`, label: parent.name }] : []), { label: o.name }]}
        title={o.name}
        badge={<Badge variant="secondary">{kindLabel(t, o.kind)}</Badge>}
        meta={o.status !== "active" ? t.dynamic(`rentals.statuses.${o.status}`) : o.included ? t("rentals.includedShort") : running ? t("rentals.busyWith", { who: peopleLine(running.rental_contacts) || "–" }) : t("rentals.free")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={`/rentals/new?parent=${id}`} icon={<FolderPlusIcon />}>
                {t("rentals.addSub")}
              </MenuLink>
              <MenuSeparator />
              <MenuSubmit form="trash-object" icon={<Trash2Icon />} destructive>
                {t("rentals.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={
          canManage && o.status === "active" && !o.included
            ? o.rentable
              ? { href: `/rentals/r/new?object=${id}`, label: t.dynamic(`rentals.newWord.${word}`) }
              : o.lendable
                ? { href: withParams(sp, { handout: id }), label: t("rentals.handOut") }
                : undefined
            : undefined
        }
      />
      {canManage && (
        <form id="trash-object" action={trashObjectAction} hidden>
          <input type="hidden" name="id" value={id} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <RecordLayout aside={<ObjectForm t={t} o={o} objects={all ?? []} locations={locations ?? []} defs={defs} />}>
        {(o.rentable || o.lendable || !!rentals?.length) && (
          <FormCard id="rentals" title={t.dynamic(`rentals.words.${word}`) + " · " + t("rentals.current")}>
            {current.length ? <ul className="grid gap-2">{current.map(rentalRow)}</ul> : <p className="text-sm text-muted-foreground">{t("rentals.noRentals")}</p>}
            {earlier.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {t("rentals.history")} ({earlier.length})
                </summary>
                <ul className="mt-2 grid gap-2">{earlier.map(rentalRow)}</ul>
              </details>
            )}
          </FormCard>
        )}

        <FormCard
          id="children"
          title={`${t("rentals.children")} (${children.length})`}
          action={
            canManage && (
              <span className="flex flex-wrap gap-2">
                <form action={addChildrenAction}>
                  <input type="hidden" name="parent_id" value={id} />
                  <input type="hidden" name="kind" value={childKind} />
                  <input type="hidden" name="count" value="1" />
                  <input type="hidden" name="prefix" value={kindLabel(t, childKind)} />
                  <input type="hidden" name="deposit" value="" />
                  <SubmitButton size="sm" variant="outline">
                    <PlusIcon /> {kindLabel(t, childKind)}
                  </SubmitButton>
                </form>
                <Button render={<Link href={withParams(sp, { several: "1" })} scroll={false} />} nativeButton={false} size="sm" variant="ghost">
                  {t("rentals.addSeveral")}
                </Button>
              </span>
            )
          }
        >
          {children.length ? (
            <ul className="divide-y rounded-lg border">
              {children.map((c) => {
                const h = holder(c.id)
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <Link href={`/rentals/${c.id}`} className="grid min-w-0 flex-1 hover:underline">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{kindLabel(t, c.kind)}</span>
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {c.status === "lost" ? t("rentals.lostShort") : c.included ? t("rentals.includedShort") : h ? t("rentals.handedTo", { who: peopleLine(h.rental_contacts) || "–", date: t.date(h.starts_at, { dateStyle: "medium" }) }) : c.lendable ? t("rentals.inOffice") : ""}
                    </span>
                    {canManage && c.lendable && c.status === "active" && !c.included &&
                      (h ? (
                        <form action={returnAction}>
                          <input type="hidden" name="id" value={h.id} />
                          <input type="hidden" name="back" value={here} />
                          <SubmitButton size="xs" variant="outline">
                            {t("rentals.giveBack")}
                          </SubmitButton>
                        </form>
                      ) : (
                        <Button render={<Link href={withParams(sp, { handout: c.id })} scroll={false} />} nativeButton={false} size="xs" variant="outline">
                          {t("rentals.handOut")}
                        </Button>
                      ))}
                    {!c.lendable && <ChevronRightIcon className="size-4 text-muted-foreground" />}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("rentals.noChildren")}</p>
          )}
        </FormCard>

        {o.rentable && (
          <FormCard
            id="rates"
            title={t("rentals.rates")}
            description={t("rentals.ratesHint")}
            action={
              canManage && (
                <Button render={<Link href={withParams(sp, { rate: "new" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                  <PlusIcon /> {t("rentals.newRate")}
                </Button>
              )
            }
          >
            {rates?.length ? (
              <ul className="divide-y rounded-lg border">
                {rates.map((r) => (
                  <li key={r.id}>
                    <Link href={canManage ? withParams(sp, { rate: r.id }) : "#"} scroll={false} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{r.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[
                            `${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}`,
                            r.term_months && t("rentals.termShort", { months: r.term_months }),
                            r.renew_months && t("rentals.renewShort", { months: r.renew_months }),
                            r.notice_months != null && longTerm(r.unit) && t("rentals.noticeShort", { months: r.notice_months }),
                            r.deposit_cents != null && `${t("rentals.deposit")} ${t.money(r.deposit_cents)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {!r.active && <Badge variant="outline">{t("rentals.statuses.inactive")}</Badge>}
                      {canManage && <PencilIcon className="size-4 text-muted-foreground" />}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("rentals.noRates")}</p>
            )}
          </FormCard>
        )}

        <FileList ctx={ctx} entity="rental_objects" entityId={id} back={here} />
      </RecordLayout>

      {canManage && handout && (
        <UrlSheet params={["handout"]} title={`${handout.name} · ${t("rentals.handOut")}`}>
          <form action={handOutAction} className="grid gap-4">
            <input type="hidden" name="object_id" value={handout.id} />
            <input type="hidden" name="back" value={here} />
            {handout.parent_id === id && running && <input type="hidden" name="parent_id" value={running.id} />}
            <ContactPicker name="contact_id" label={t("rentals.handOutTo")} />
            <div className="grid grid-cols-2 gap-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="h-from">{t("rentals.starts")}</Label>
                <TypedInput kind="date" id="h-from" name="starts_at" defaultValue={now.slice(0, 10)} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="h-dep">{t("rentals.deposit")}</Label>
                <TypedInput kind="money" id="h-dep" name="deposit" defaultValue={handout.deposit_cents != null ? formatMoney(handout.deposit_cents) : ""} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="h-note">{t("rentals.note")}</Label>
              <Input id="h-note" name="note" maxLength={500} />
            </div>
            <SaveBar label={t("rentals.handOut")} always />
          </form>
        </UrlSheet>
      )}

      {canManage && param(sp, "several") && (
        <UrlSheet params={["several"]} title={t("rentals.addSeveral").replace("…", "")}>
          <form action={addChildrenAction} className="grid gap-4">
            <input type="hidden" name="parent_id" value={id} />
            <div className="grid grid-cols-2 gap-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="s-count">{t("rentals.howMany")}</Label>
                <TypedInput kind="number" id="s-count" name="count" min={1} max={100} defaultValue={4} required />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="s-kind">{t("rentals.kind")}</Label>
                <NativeSelect id="s-kind" name="kind" defaultValue={childKind} className="w-full">
                  {[...KINDS.access, ...KINDS.item, ...KINDS.place].map((k) => (
                    <NativeSelectOption key={k} value={k}>
                      {kindLabel(t, k)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-prefix">{t("rentals.prefix")}</Label>
              <Input id="s-prefix" name="prefix" maxLength={40} placeholder={`${o.name.split(" ").pop()}`} />
              <p className="text-xs text-muted-foreground">{t("rentals.prefixHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-dep">{t("rentals.deposit")}</Label>
              <TypedInput kind="money" id="s-dep" name="deposit" />
            </div>
            <SaveBar label={t("rentals.addChildren")} always />
          </form>
        </UrlSheet>
      )}

      {canManage && o.rentable && (rateEdit === "new" || rate) && (
        <UrlSheet params={["rate"]} title={rate ? rate.name : t("rentals.newRate")}>
          <form action={saveRateAction} className="grid gap-4">
            <input type="hidden" name="object_id" value={id} />
            {rate && <input type="hidden" name="id" value={rate.id} />}
            <div className="grid gap-2">
              <Label htmlFor="r-name">{t("rentals.rateName")}</Label>
              <Input id="r-name" name="name" required maxLength={100} defaultValue={rate?.name ?? ""} placeholder={t("rentals.ratePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="r-price">{t("rentals.price")}</Label>
                <TypedInput kind="money" id="r-price" name="price" defaultValue={rate ? formatMoney(rate.price_cents) : ""} required />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="r-unit">{t("rentals.unit")}</Label>
                <NativeSelect id="r-unit" name="unit" defaultValue={rate?.unit ?? (family === "place" ? "month" : "day")} className="w-full">
                  {UNITS.map((u) => (
                    <NativeSelectOption key={u} value={u}>
                      {t.dynamic(`rentals.units.${u}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="r-dep">{t("rentals.deposit")}</Label>
                <TypedInput kind="money" id="r-dep" name="deposit" defaultValue={rate?.deposit_cents != null ? formatMoney(rate.deposit_cents) : ""} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="r-min">{t("rentals.minUnits")}</Label>
                <TypedInput kind="number" id="r-min" name="min_units" min={1} max={1000} defaultValue={rate?.min_units ?? 1} />
              </div>
            </div>
            <fieldset className="grid gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{t("rentals.longTermOnly")}</legend>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid content-start gap-2">
                  <Label htmlFor="r-term">{t("rentals.termMonths")}</Label>
                  <TypedInput kind="number" id="r-term" name="term_months" min={1} max={600} defaultValue={rate?.term_months ?? ""} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="r-renew">{t("rentals.renewMonths")}</Label>
                  <TypedInput kind="number" id="r-renew" name="renew_months" min={1} max={600} defaultValue={rate?.renew_months ?? ""} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="r-notice">{t("rentals.noticeMonths")}</Label>
                  <TypedInput kind="number" id="r-notice" name="notice_months" min={0} max={60} defaultValue={rate?.notice_months ?? ""} />
                </div>
              </div>
            </fieldset>
            {rate && (
              <label className="flex items-center gap-2 text-sm">
                <input type="hidden" name="active" value="off" />
                <input type="checkbox" name="active" value="on" defaultChecked={rate.active} className="size-4 accent-primary" />
                {t("rentals.rateActive")}
              </label>
            )}
            <SaveBar label={rate ? undefined : t("rentals.newRate")} always={!rate} />
          </form>
          {rate && (
            <form action={deleteRateAction} className="border-t pt-4">
              <input type="hidden" name="id" value={rate.id} />
              <input type="hidden" name="object_id" value={id} />
              <SubmitButton size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                <Trash2Icon /> {t("rentals.deleteRate")}
              </SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
