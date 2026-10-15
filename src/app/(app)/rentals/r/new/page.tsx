import Link from "next/link"
import { notFound } from "next/navigation"
import { Choice } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { NewPage } from "@/components/new-page"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { toLocalInput } from "@/lib/time"
import { param, type SearchParams } from "@/lib/url"
import { longTerm, UNITS, wordFor, type Family } from "@/rentals/fields"
import { createRentalAction } from "../../actions"
import { kindLabel } from "../../parts"

// New contract / booking / loan for one object (?object=…; from the calendar also ?start=&end=). Picking a rate is
// enough: empty price/terms are taken from it on save, so the form stays short.
export default async function NewRentalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  const sp = await searchParams
  const objectId = param(sp, "object") ?? param(sp, "resource")
  // From the calendar without an object column (month view): pick the object first, keeping start/end.
  if (!objectId || !/^[0-9a-f-]{36}$/.test(objectId)) {
    const { data: objects } = await ctx.supabase.from("rental_objects").select("id, name, kind").eq("org_id", ctx.org.id).is("deleted_at", null).eq("rentable", true).eq("status", "active").eq("included", false).order("name").limit(500)
    const keep = new URLSearchParams(Object.entries({ start: param(sp, "start"), end: param(sp, "end") }).filter((x): x is [string, string] => !!x[1]))
    return (
      <NewPage list={{ href: "/rentals/calendar", label: t("rentals.tabs.calendar") }} title={t("rentals.pickObject")}>
        <ul className="divide-y rounded-lg border">
          {(objects ?? []).map((x) => (
            <li key={x.id}>
              <Link href={`/rentals/r/new?object=${x.id}${keep.size ? `&${keep}` : ""}`} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted">
                <span className="flex-1 font-medium">{x.name}</span>
                <span className="text-xs text-muted-foreground">{kindLabel(t, x.kind)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </NewPage>
    )
  }
  const [{ data: o }, { data: rates }, defs] = await Promise.all([
    ctx.supabase.from("rental_objects").select("id, name, kind, family").eq("id", objectId).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("rental_rates").select("id, name, unit, price_cents").eq("object_id", objectId).eq("org_id", ctx.org.id).eq("active", true).order("position"),
    loadFields(ctx.supabase, ctx.org.id, "rentals"),
  ])
  if (!o) notFound()
  const first = rates?.[0]
  const long = longTerm(first?.unit)
  const word = wordFor(o.family as Family, first?.unit)
  const start = param(sp, "start")
  const end = param(sp, "end")
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  return (
    <NewPage list={{ href: `/rentals/${o.id}`, label: o.name }} title={`${t.dynamic(`rentals.words.${word}`)} · ${o.name}`} error={param(sp, "error")}>
      <form action={createRentalAction} className="grid gap-6">
        <input type="hidden" name="object_id" value={o.id} />
        <FormCard id="who" title={t("rentals.people")} description={t("rentals.peopleHintNew")}>
          <ContactPicker name="contact_id" label={t("rentals.roles.main")} />
        </FormCard>
        <FormCard id="when" title={t("rentals.whenTitle")} description={long ? t("rentals.endsHint") : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="n-start">{t("rentals.starts")}</Label>
              {long ? (
                <TypedInput kind="date" id="n-start" name="starts_at" required defaultValue={start?.slice(0, 10) ?? today} />
              ) : (
                <Input id="n-start" name="starts_at" type="datetime-local" required defaultValue={start ? toLocalInput(start) : `${today}T10:00`} />
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="n-end">{t("rentals.ends")}</Label>
              {long ? <TypedInput kind="date" id="n-end" name="ends_at" defaultValue={end?.slice(0, 10) ?? ""} /> : <Input id="n-end" name="ends_at" type="datetime-local" defaultValue={end ? toLocalInput(end) : ""} />}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-status">{t("rentals.requestStatus")}</Label>
            <Choice id="n-status" name="status" label={t("rentals.requestStatus")} required defaultValue="confirmed" options={(["confirmed", "request"] as const).map((x) => ({ value: x, label: t(`rentals.statusOptions.${x}`) }))} />
          </div>
        </FormCard>
        <FormCard id="price" title={t("rentals.priceTitle")} description={rates?.length ? t("rentals.rateHint") : undefined}>
          {!!rates?.length && (
            <div className="grid gap-2">
              <Label htmlFor="n-rate">{t("rentals.rate")}</Label>
              <NativeSelect id="n-rate" name="rate_id" defaultValue={first?.id ?? ""} className="w-full">
                <NativeSelectOption value="">{t("rentals.noRate")}</NativeSelectOption>
                {rates.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.name} · {t.money(r.price_cents)} {t.dynamic(`rentals.units.${r.unit}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="n-price">{t("rentals.price")}</Label>
              <TypedInput kind="money" id="n-price" name="price" placeholder={t("rentals.fromRate")} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="n-unit">{t("rentals.unit")}</Label>
              <NativeSelect id="n-unit" name="unit" defaultValue="" className="w-full">
                <NativeSelectOption value="">{t("rentals.fromRate")}</NativeSelectOption>
                {UNITS.map((u) => (
                  <NativeSelectOption key={u} value={u}>
                    {t.dynamic(`rentals.units.${u}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="n-dep">{t("rentals.deposit")}</Label>
              <TypedInput kind="money" id="n-dep" name="deposit" placeholder={t("rentals.fromRate")} />
            </div>
            {long && (
              <>
                <div className="grid content-start gap-2">
                  <Label htmlFor="n-notice">{t("rentals.notice")}</Label>
                  <TypedInput kind="number" id="n-notice" name="notice_months" min={0} max={60} placeholder={t("rentals.fromRate")} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="n-renew">{t("rentals.renew")}</Label>
                  <TypedInput kind="number" id="n-renew" name="renew_months" min={1} max={600} placeholder={t("rentals.fromRate")} />
                </div>
              </>
            )}
          </div>
        </FormCard>
        <FormCard id="more" title={defs.length ? t("membership.moreFields") : t("rentals.note")}>
          <CustomFieldInputs defs={defs} idPrefix="n-custom" />
          <Textarea name="note" rows={3} maxLength={20000} aria-label={t("rentals.note")} placeholder={t("rentals.note")} />
        </FormCard>
        <p className="text-xs text-muted-foreground">
          {kindLabel(t, o.kind)} · {o.name}
        </p>
        <SaveBar label={t.dynamic(`rentals.newWord.${word}`)} always />
      </form>
    </NewPage>
  )
}

export const instant = false
