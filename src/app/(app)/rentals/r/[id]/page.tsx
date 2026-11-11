import Link from "next/link"
import { notFound } from "next/navigation"
import { Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields, type CustomValues } from "@/lib/custom-fields"
import { formatMoney } from "@/lib/inputs"
import { toLocalInput } from "@/lib/time"
import { param } from "@/lib/url"
import { longTerm, noticeEnd, rentalState, termInfo, UNITS, wordFor, type Family } from "@/rentals/fields"
import { RENTAL_COLS } from "@/rentals/server"
import { contactName } from "../../../contacts/fields"
import { addPersonAction, giveNoticeAction, removePersonAction, returnAction, trashRentalAction, updateRentalAction } from "../../actions"
import { kindLabel, period, StateBadge } from "../../parts"
import { TermFields } from "../../term-fields"
import { UrlSheet } from "@/components/url-sheet"
import { readFields } from "@/letters/model"
import { contactVars, letterhead, loadTemplate } from "@/letters/server"
import { Composer } from "../../../files/templates/[id]/composer"
import { ContractMenu } from "./contract-menu"
import { DateInput } from "@/components/date-input"

// One rental (Mietvertrag / Buchung / Ausleihe / Ausgabe): people with roles, period and terms (saved by the save bar),
// notice, keys handed out on it, files.
export default async function RentalPage({ params, searchParams }: PageProps<"/rentals/r/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("rentals.manage")
  const [{ data: r }, { data: handouts }, defs, { data: contracts }] = await Promise.all([
    ctx.supabase.from("rentals").select(`${RENTAL_COLS}, rental_objects(id, name, kind, family, parent_id), rental_rates(name)`).eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("rentals").select(`${RENTAL_COLS}, rental_objects(id, name, kind)`).eq("parent_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).order("starts_at"),
    loadFields(ctx.supabase, ctx.org.id, "rentals"),
    // Contract templates = letter templates that use the rental's placeholders (own ones first).
    ctx.can("org.files.view")
      ? ctx.supabase.from("letter_templates").select("id, name, org_id").or(`org_id.is.null,org_id.eq.${ctx.org.id}`).is("deleted_at", null).ilike("body", "%{rental\\_%").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; org_id: string | null }[] }),
  ])
  if (!r || !r.rental_objects) notFound()
  // ?contract=<template>: write the contract right here (drawer with live preview), for the main tenant + this rental.
  const contractId = param(sp, "contract")
  const mainId = (r.rental_contacts ?? []).find((p) => p.role === "main")?.contact_id ?? null
  const composer =
    contractId && mainId && ctx.can("org.files.view") && (contracts ?? []).some((c) => c.id === contractId)
      ? await Promise.all([loadTemplate(ctx, contractId), letterhead(ctx), contactVars(ctx, t, mainId, id)]).then(([template, head, filled]) => (template ? { template, head, filled, contactId: mainId } : null))
      : null
  const o = r.rental_objects
  const word = wordFor(o.family as Family, r.unit)
  const state = rentalState(r)
  const long = longTerm(r.unit)
  const editable = canManage && !r.deleted_at
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const here = `/rentals/r/${id}`
  const people = [...(r.rental_contacts ?? [])].sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
  // The contract term in words (long-term): renewing (current term + notice deadline), fixed, or open-ended.
  const berlinDay = (v: string) => new Date(v).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const long_ = (d: string) => t.date(`${d}T12:00:00Z`, { dateStyle: "medium" })
  const months = (n: number) => (n % 12 === 0 ? t("letters.years", { count: n / 12 }) : t("rentals.noticeMonthsText", { count: n }))
  const term = termInfo({ end: r.ends_at ? berlinDay(r.ends_at) : null, renew_months: r.renew_months, notice_months: r.notice_months, noticeGiven: !!r.notice_at }, today)
  const begun = berlinDay(r.starts_at) <= today ? t("rentals.term.since", { date: long_(berlinDay(r.starts_at)) }) : t("rentals.term.from", { date: long_(berlinDay(r.starts_at)) })
  const termText = [
    begun,
    term.kind === "fixed"
      ? t("rentals.term.fixed", { date: long_(term.end) })
      : term.kind === "renew"
        ? t("rentals.term.renew", { end: long_(term.termEnd), renew: months(r.renew_months!) }) + (r.notice_months != null ? ` · ${t("rentals.term.deadline", { date: long_(term.deadline) })}` : "")
        : term.earliest
          ? t("rentals.term.openNotice", { date: long_(term.earliest) })
          : t("rentals.term.open"),
  ].join(" · ")
  const dateValue = (v: string | null) => (v ? (long ? new Date(v).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) : toLocalInput(v)) : "")

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/rentals", label: t("rentals.nav") }, { href: `/rentals/${o.id}`, label: o.name }, { label: t.dynamic(`rentals.words.${word}`) }]}
        title={`${t.dynamic(`rentals.words.${word}`)} · ${o.name}`}
        badge={<StateBadge t={t} r={r} />}
        meta={[period(t, r), r.price_cents != null && r.unit ? `${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}` : null, r.notice_at ? t("rentals.noticeReceived", { date: t.date(r.notice_at, { dateStyle: "medium" }) }) : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {ctx.can("org.files.view") && people.some((p) => p.role === "main") && (
              <ContractMenu
                label={t("rentals.writeContract")}
                chooseHref={`/files/templates?contact=${people.find((p) => p.role === "main")!.contact_id}&rental=${id}`}
                items={[...(contracts ?? [])]
                  .sort((a, b) => Number(a.org_id === null) - Number(b.org_id === null))
                  .map((c) => ({ href: `${here}?contract=${c.id}`, label: c.name }))}
              />
            )}
            {editable && state === "running" && !long && (
              <form action={returnAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={here} />
                <SubmitButton size="sm" variant="outline">
                  {t("rentals.giveBack")}
                </SubmitButton>
              </form>
            )}
          </>
        }
        menu={
          editable && (
            <ActionsMenu>
              <MenuSubmit form="trash-rental" icon={<Trash2Icon />} destructive>
                {t("rentals.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
      />
      {editable && (
        <form id="trash-rental" action={trashRentalAction} hidden>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={`/rentals/${o.id}`} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <RecordLayout
        aside={
          <>
            <FormCard id="people" title={t("rentals.people")} description={t("rentals.peopleHint")}>
              {people.length ? (
                <ul className="divide-y rounded-lg border">
                  {people.map((p) => (
                    <li key={p.contact_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Link href={`/contacts/${p.contact_id}`} className="grid min-w-0 flex-1 hover:underline">
                        <span className="truncate font-medium">{p.contacts ? contactName(p.contacts) : "–"}</span>
                        <span className="truncate text-xs text-muted-foreground">{t.dynamic(`rentals.roles.${p.role}`)}</span>
                      </Link>
                      {editable && (
                        <form action={removePersonAction}>
                          <input type="hidden" name="id" value={id} />
                          <input type="hidden" name="contact_id" value={p.contact_id} />
                          <Tooltip>
                            <TooltipTrigger render={<SubmitButton size="icon-sm" variant="ghost" aria-label={t("rentals.removePerson")} className="text-destructive hover:text-destructive" />}>
                              <XIcon />
                            </TooltipTrigger>
                            <TooltipContent>{t("rentals.removePerson")}</TooltipContent>
                          </Tooltip>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("rentals.nobody")}</p>
              )}
              {editable && (
                <form action={addPersonAction} className="grid gap-3 border-t pt-3">
                  <input type="hidden" name="id" value={id} />
                  <ContactPicker name="contact_id" label={t("rentals.addPerson")} />
                  <Choice name="role" label={t("rentals.people")} required defaultValue={people.some((p) => p.role === "main") ? "member" : "main"} options={(["main", "member"] as const).map((x) => ({ value: x, label: t(`rentals.roles.${x}`) }))} />
                  <SubmitButton size="sm" variant="outline" className="justify-self-start">
                    {t("rentals.addPerson")}
                  </SubmitButton>
                </form>
              )}
            </FormCard>

            {editable && long && !r.notice_at && state !== "ended" && (
              <FormCard id="notice" title={t("rentals.giveNotice")} description={t("rentals.noticeHint", { date: t.date(`${noticeEnd(r, today)}T12:00:00`, { dateStyle: "medium" }) })}>
                <form action={giveNoticeAction} className="grid gap-3">
                  <input type="hidden" name="id" value={id} />
                  <div className="grid gap-2">
                    <Label htmlFor="g-end">{t("rentals.noticeOtherDate")}</Label>
                    <TypedInput kind="date" id="g-end" name="ends_on" />
                  </div>
                  <SubmitButton size="sm" variant="outline" className="justify-self-start">
                    {t("rentals.giveNotice")}
                  </SubmitButton>
                </form>
              </FormCard>
            )}

            {!!handouts?.length && (
              <FormCard id="keys" title={t("rentals.keys")}>
                <ul className="divide-y rounded-lg border">
                  {handouts.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Link href={`/rentals/${h.rental_objects?.id}`} className="grid min-w-0 flex-1 hover:underline">
                        <span className="truncate font-medium">{h.rental_objects?.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {h.rental_contacts?.[0]?.contacts ? contactName(h.rental_contacts[0].contacts) : "–"} · {period(t, h)}
                        </span>
                      </Link>
                      <StateBadge t={t} r={h} />
                    </li>
                  ))}
                </ul>
              </FormCard>
            )}
            <FileList ctx={ctx} entity="rentals" entityId={id} back={here} />
          </>
        }
      >
        <form action={updateRentalAction} className="grid gap-6">
          <input type="hidden" name="id" value={id} />
          <fieldset disabled={!editable} className="grid gap-6">
            <FormCard id="terms" title={t("rentals.whenTitle")} description={long ? termText : undefined}>
              {long ? (
                <TermFields start={dateValue(r.starts_at)} end={r.ends_at ? dateValue(r.ends_at) : null} renew={r.renew_months} notice={r.notice_months} disabled={!editable} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <Label htmlFor="e-start">{t("rentals.starts")}</Label>
                    <DateInput id="e-start" name="starts_at" type="datetime-local" required defaultValue={dateValue(r.starts_at)} />
                  </div>
                  <div className="grid content-start gap-2">
                    <Label htmlFor="e-end">{t("rentals.ends")}</Label>
                    <DateInput id="e-end" name="ends_at" type="datetime-local" defaultValue={dateValue(r.ends_at)} />
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="e-status">{t("rentals.requestStatus")}</Label>
                <Choice id="e-status" name="status" label={t("rentals.requestStatus")} required disabled={!editable} defaultValue={r.status} options={(["confirmed", "request", "cancelled"] as const).map((x) => ({ value: x, label: t(`rentals.statusOptionsAll.${x}`) }))} />
                <p className="text-xs text-muted-foreground">{t("rentals.statusHint")}</p>
              </div>
            </FormCard>
            <FormCard id="price" title={t("rentals.priceTitle")} description={r.rental_rates?.name ? `${t("rentals.rate")}: ${r.rental_rates.name}` : undefined}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor="e-price">{t("rentals.price")}</Label>
                  <TypedInput kind="money" id="e-price" name="price" defaultValue={r.price_cents != null ? formatMoney(r.price_cents) : ""} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="e-unit">{t("rentals.unit")}</Label>
                  <NativeSelect id="e-unit" name="unit" defaultValue={r.unit ?? ""} className="w-full">
                    <NativeSelectOption value="">–</NativeSelectOption>
                    {UNITS.map((u) => (
                      <NativeSelectOption key={u} value={u}>
                        {t.dynamic(`rentals.units.${u}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="e-dep">{t("rentals.deposit")}</Label>
                  <TypedInput kind="money" id="e-dep" name="deposit" defaultValue={r.deposit_cents != null ? formatMoney(r.deposit_cents) : ""} />
                </div>
              </div>
              {r.deposit_back_at && <Badge variant="outline">{t("rentals.depositBack")}</Badge>}
            </FormCard>
            <FormCard id="more" title={defs.length ? t("membership.moreFields") : t("rentals.note")}>
              <CustomFieldInputs defs={defs} values={r.custom as CustomValues | undefined} idPrefix="e-custom" />
              <Textarea name="note" rows={4} maxLength={20000} defaultValue={r.note} aria-label={t("rentals.note")} placeholder={t("rentals.note")} />
            </FormCard>
            {editable && <SaveBar />}
          </fieldset>
        </form>
        <p className="text-xs text-muted-foreground">
          {kindLabel(t, o.kind)} · {o.name}
        </p>
      </RecordLayout>
      {composer && (
        <UrlSheet params={["contract"]} wide title={composer.template.name} description={t("rentals.contractSheetHint")}>
          <Composer
            template={{ id: composer.template.id, name: composer.template.name, title: composer.template.title, body: composer.template.body, letterhead: composer.template.letterhead }}
            fields={readFields(composer.template.fields)}
            seller={composer.head.seller}
            logoUrl={composer.head.logoUrl}
            orgName={composer.head.seller.legal_name ?? ctx.org.name}
            initialContact={null}
            initialFilled={composer.filled}
            canManage={ctx.can("org.files.manage")}
            canPickContact={false}
            fixedContact={composer.contactId}
            rentalId={id}
            doneHref={here}
          />
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
