import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { Choice } from "@/components/choice"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"
import { formatMoney } from "@/lib/inputs"
import { FAMILIES, KINDS, rentalState, type Family } from "@/rentals/fields"
import { contactName } from "../contacts/fields"
import { saveObjectAction } from "./actions"

/** "studio" → "Studio"; custom kinds are shown as typed. */
export const kindLabel = (t: T, kind: string) => (t.has(`rentals.kinds.${kind}`) ? t.dynamic(`rentals.kinds.${kind}`) : kind)

export function StateBadge({ t, r }: { t: T; r: { status: string; starts_at: string; ends_at: string | null } }) {
  const s = rentalState(r)
  return <Badge variant={s === "running" ? "default" : s === "upcoming" || s === "request" ? "secondary" : "outline"}>{t.dynamic(`rentals.states.${s}`)}</Badge>
}

type Person = { role: string; contacts: { first_name: string | null; last_name: string | null; company: string | null; email: string | null } | null }
/** "Anna, Ben (+2)": main tenants first. */
export function peopleLine(people: Person[] | null | undefined, max = 2) {
  const sorted = [...(people ?? [])].sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
  const names = sorted.map((p) => (p.contacts ? contactName(p.contacts) : "–"))
  return names.length > max ? `${names.slice(0, max).join(", ")} (+${names.length - max})` : names.join(", ")
}

/** Period as text: "seit 01.03.2026", "01.03.2026 – 28.02.2027", "02.05., 10:00–12:00". */
export function period(t: T, r: { starts_at: string; ends_at: string | null; unit?: string | null }) {
  const timed = r.unit === "hour" || r.unit === "day"
  const d = (v: string) => t.date(v, timed ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" })
  return r.ends_at ? `${d(r.starts_at)} – ${d(r.ends_at)}` : t("rentals.since", { date: d(r.starts_at) })
}

export type ObjectLite = { id: string; name: string; parent_id: string | null; kind: string }

// Object fields in cards: what it is (name, kind, where it belongs), how it's given out (rentable / handed out /
// fixed part, capacity, deposit), custom fields. New objects skip the second card: the family's defaults apply.
export function ObjectForm({
  t,
  o,
  objects,
  locations,
  defs,
  parentId,
  kind,
}: {
  t: T
  o?: { id: string; name: string; kind: string; parent_id: string | null; status: string; rentable: boolean; lendable: boolean; included: boolean; capacity: number; deposit_cents: number | null; location_id: string | null; description: string; custom: unknown }
  objects: ObjectLite[]
  locations: { id: string; name: string }[]
  defs: FieldDef[]
  parentId?: string | null
  kind?: string | null
}) {
  const current = o?.kind ?? kind ?? "room"
  const custom = !FAMILIES.some((f) => KINDS[f].includes(current))
  return (
    <form action={saveObjectAction} className="grid gap-6">
      {o && <input type="hidden" name="id" value={o.id} />}
      <FormCard id="object" title={t("rentals.basics")}>
        <div className="grid gap-2">
          <Label htmlFor="o-name">{t("rentals.name")}</Label>
          <Input id="o-name" name="name" defaultValue={o?.name ?? ""} required maxLength={200} className="text-base font-medium" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="o-kind">{t("rentals.kind")}</Label>
            <NativeSelect id="o-kind" name="kind" defaultValue={custom ? "_custom" : current} className="w-full">
              {(FAMILIES.filter((f) => f !== "other") as Family[]).map((f) => (
                <optgroup key={f} label={t.dynamic(`rentals.families.${f}`)}>
                  {KINDS[f].map((k) => (
                    <NativeSelectOption key={k} value={k}>
                      {kindLabel(t, k)}
                    </NativeSelectOption>
                  ))}
                </optgroup>
              ))}
              <NativeSelectOption value="_custom">{t("rentals.customKind")}…</NativeSelectOption>
            </NativeSelect>
            <Input name="custom_kind" defaultValue={custom ? current : ""} maxLength={40} placeholder={t("rentals.customKind")} aria-label={t("rentals.customKind")} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="o-parent">{t("rentals.parent")}</Label>
            <NativeSelect id="o-parent" name="parent_id" defaultValue={o?.parent_id ?? parentId ?? ""} className="w-full">
              <NativeSelectOption value="">{t("rentals.noParent")}</NativeSelectOption>
              {objects
                .filter((x) => x.id !== o?.id)
                .map((x) => (
                  <NativeSelectOption key={x.id} value={x.id}>
                    {x.name} · {kindLabel(t, x.kind)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </div>
        </div>
        {locations.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="o-loc">{t("rentals.location")}</Label>
            <Choice id="o-loc" name="location_id" label={t("rentals.location")} defaultValue={o?.location_id} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="o-desc">{t("rentals.description")}</Label>
          <Textarea id="o-desc" name="description" rows={3} maxLength={20000} defaultValue={o?.description ?? ""} />
        </div>
        {o && (
          <div className="grid gap-2">
            <Label htmlFor="o-status">{t("rentals.status")}</Label>
            <Choice id="o-status" name="status" label={t("rentals.status")} required defaultValue={o.status} options={(["active", "inactive", "lost"] as const).map((x) => ({ value: x, label: t(`rentals.statuses.${x}`) }))} />
          </div>
        )}
      </FormCard>

      {o && (
        <FormCard id="options" title={t("rentals.options")}>
          <input type="hidden" name="options" value="1" />
          <div className="grid gap-2.5">
            {(["rentable", "lendable", "included"] as const).map((k) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name={k} defaultChecked={o[k]} className="mt-0.5 size-4 accent-primary" />
                {t(`rentals.${k}`)}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="o-cap">{t("rentals.capacity")}</Label>
              <TypedInput kind="number" id="o-cap" name="capacity" min={1} max={10000} defaultValue={o.capacity} />
              <p className="text-xs text-muted-foreground">{t("rentals.capacityHint")}</p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="o-dep">{t("rentals.deposit")}</Label>
              <TypedInput kind="money" id="o-dep" name="deposit" defaultValue={o.deposit_cents != null ? formatMoney(o.deposit_cents) : ""} />
            </div>
          </div>
        </FormCard>
      )}
      {defs.length > 0 && (
        <FormCard id="custom" title={t("membership.moreFields")}>
          <CustomFieldInputs defs={defs} values={o?.custom as CustomValues | undefined} idPrefix="o-custom" />
        </FormCard>
      )}
      <SaveBar label={o ? undefined : t("rentals.createObject")} always={!o} />
    </form>
  )
}
