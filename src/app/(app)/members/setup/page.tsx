import { notFound } from "next/navigation"
import { Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param, siteUrl } from "@/lib/url"
import { INTERVALS, type Interval } from "@/members/dues"
import { NumberRangeForm } from "@/components/number-range-form"
import { deleteType, saveMemberRange, saveSettings, saveType } from "../actions"

export default async function MembersSetupPage({ searchParams }: PageProps<"/members/setup">) {
  const ctx = await requirePerm("members.manage")
  if (!ctx.modules.has("members")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [{ data: types }, { data: settings }, { data: range }] = await Promise.all([
    ctx.supabase.from("membership_types").select("*").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("member_settings").select("*").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("number_ranges").select("format, next_number, yearly_reset").eq("org_id", ctx.org.id).eq("kind", "member").maybeSingle(),
  ])

  return (
    <>
      <div className="grid gap-1">
        <h1 className="font-heading text-2xl font-semibold">{t("membership.tabs.setup")}</h1>
        <p className="text-sm break-all text-muted-foreground">{t("portal.portalLink", { url: siteUrl(ctx.org.slug, "/portal") })}</p>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <section className="grid gap-3" aria-labelledby="types">
        <div>
          <h2 id="types" className="font-medium">
            {t("membership.types")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("membership.typesHint")}</p>
        </div>
        <ul className="grid gap-3">
          {(types ?? []).map((x) => (
            <li key={x.id} className="rounded-lg border p-3">
              <TypeForm t={t} type={x} />
            </li>
          ))}
          <li className="rounded-lg border border-dashed p-3">
            <TypeForm t={t} />
          </li>
        </ul>
      </section>

      <section className="grid gap-3" aria-labelledby="sepa">
        <div>
          <h2 id="sepa" className="font-medium">
            {t("membership.sepa")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("membership.creditorHint")}</p>
        </div>
        <form action={saveSettings} className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="s-name" name="creditor_name" label={t("membership.creditorName")} maxLength={70} defaultValue={settings?.creditor_name ?? ctx.org.name} />
            <Field id="s-cid" name="creditor_id" label={t("membership.creditorId")} maxLength={35} defaultValue={settings?.creditor_id ?? ""} placeholder="DE98ZZZ09999999999" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <Field id="s-iban" name="iban" label="IBAN" maxLength={40} defaultValue={settings?.iban ?? ""} />
            <Field id="s-bic" name="bic" label={t("membership.bicOptional")} maxLength={11} defaultValue={settings?.bic ?? ""} />
            <Field id="s-day" name="due_day" type="number" min={1} max={28} label={t("membership.dueDay")} defaultValue={settings?.due_day ?? 15} />
          </div>
          <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
        </form>
      </section>

      <section className="grid gap-3" aria-labelledby="numbers">
        <div>
          <h2 id="numbers" className="font-medium">
            {t("membership.numberRange")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("membership.numberRangeHint")}</p>
        </div>
        <NumberRangeForm t={t} kind="member" range={range} label={t("membership.numberFormat")} action={saveMemberRange} />
      </section>
    </>
  )
}

function TypeForm({ t, type }: { t: T; type?: Tables<"membership_types"> }) {
  const euros = (c?: number) => (c ? (c / 100).toFixed(2) : "")
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form action={saveType} className="grid flex-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] sm:items-end">
        {type && <input type="hidden" name="id" value={type.id} />}
        <Field id={`t-name-${type?.id ?? "new"}`} name="name" label={t("membership.typeName")} required maxLength={100} defaultValue={type?.name ?? ""} placeholder={type ? undefined : t("membership.typePlaceholder")} />
        <Field id={`t-fee-${type?.id ?? "new"}`} name="fee" type="number" min="0" step="0.01" label={t("membership.fee")} defaultValue={euros(type?.fee_cents)} />
        <div className="grid gap-2">
          <Label htmlFor={`t-int-${type?.id ?? "new"}`}>{t("membership.interval")}</Label>
          <NativeSelect id={`t-int-${type?.id ?? "new"}`} name="interval" defaultValue={type?.interval ?? "year"} className="w-full">
            {INTERVALS.map((i) => (
              <NativeSelectOption key={i} value={i}>
                {t(`membership.intervals.${i as Interval}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Field id={`t-entry-${type?.id ?? "new"}`} name="entry_fee" type="number" min="0" step="0.01" label={t("membership.entryFee")} defaultValue={euros(type?.entry_fee_cents)} />
        <Field id={`t-notice-${type?.id ?? "new"}`} name="notice_months" type="number" min={0} max={24} label={t("membership.noticeMonths")} defaultValue={type?.notice_months ?? 3} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="prorate" value="on" defaultChecked={type?.prorate ?? false} className="size-4" />
            {t("membership.prorate")}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="fee_is_minimum" value="on" defaultChecked={type?.fee_is_minimum ?? false} className="size-4" />
            {t("membership.feeIsMinimum")}
          </label>
          {type && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="hidden" name="active" value="off" />
              <input type="checkbox" name="active" value="on" defaultChecked={type.active} className="size-4" />
              {t("membership.typeActive")}
            </label>
          )}
          <SubmitButton size="sm" variant={type ? "outline" : "default"}>
            {type ? t("common.save") : t("membership.addType")}
          </SubmitButton>
        </div>
      </form>
      {type && (
        <form action={deleteType}>
          <input type="hidden" name="id" value={type.id} />
          <Tooltip>
            <TooltipTrigger render={<SubmitButton size="icon-sm" variant="ghost" aria-label={t("membership.deleteType")} />}>
              <Trash2Icon />
            </TooltipTrigger>
            <TooltipContent>{t("membership.deleteType")}</TooltipContent>
          </Tooltip>
        </form>
      )}
    </div>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

export const instant = false
