import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/copy-button"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { formatMoney } from "@/lib/inputs"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param, siteUrl } from "@/lib/url"
import { INTERVALS, type Interval } from "@/members/dues"
import { NumberRangeForm } from "@/components/number-range-form"
import { deleteType, saveMemberRange, saveSettings, saveType } from "../actions"

export default async function MembersSetupPage({ searchParams }: PageProps<"/members/settings">) {
  const ctx = await requirePerm("members.manage")
  if (!ctx.modules.has("members")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [{ data: types }, { data: settings }, { data: range }] = await Promise.all([
    ctx.supabase.from("membership_types").select("*").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("member_settings").select("*").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("number_ranges").select("format, next_number, yearly_reset").eq("org_id", ctx.org.id).eq("kind", "member").maybeSingle(),
  ])

  const editing = param(sp, "edit")
  const edit = (types ?? []).find((x) => x.id === editing)
  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/members", label: t("membership.nav") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <FormCard
        id="types"
        title={t("membership.types")}
        description={t("membership.typesHint")}
        action={
          <Button render={<Link href="/members/settings?new=type" scroll={false} />} nativeButton={false} size="sm" variant="outline">
            <PlusIcon /> {t("membership.addType")}
          </Button>
        }
      >
        {types?.length ? (
          <ul className="divide-y rounded-lg border">
            {types.map((x) => (
              <li key={x.id}>
                <Link href={`/members/settings?edit=${x.id}`} scroll={false} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted">
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{x.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        `${x.fee_is_minimum ? t("membership.feeFrom", { fee: t.money(x.fee_cents) }) : t.money(x.fee_cents)} / ${t(`membership.intervals.${x.interval as Interval}`)}`,
                        x.entry_fee_cents ? `${t("membership.entryFee")} ${t.money(x.entry_fee_cents)}` : null,
                        `${t("membership.noticeMonths")}: ${x.notice_months}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {!x.active && <Badge variant="outline">{t("membership.typeInactive")}</Badge>}
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("membership.noTypes")}</p>
        )}
      </FormCard>

      <FormCard id="sepa" title={t("membership.sepa")} description={t("membership.creditorHint")}>
        <form action={saveSettings} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="s-name" name="creditor_name" label={t("membership.creditorName")} maxLength={70} defaultValue={settings?.creditor_name ?? ctx.org.name} />
            <Field id="s-cid" name="creditor_id" label={t("membership.creditorId")} maxLength={35} defaultValue={settings?.creditor_id ?? ""} placeholder="DE98ZZZ09999999999" className="font-mono tracking-wide" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="grid content-start gap-2">
              <Label htmlFor="s-iban">IBAN</Label>
              <TypedInput kind="iban" id="s-iban" name="iban" defaultValue={settings?.iban ?? ""} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="s-bic">{t("membership.bicOptional")}</Label>
              <TypedInput kind="bic" id="s-bic" name="bic" defaultValue={settings?.bic ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-day">{t("membership.dueDay")}</Label>
            <TypedInput kind="number" id="s-day" name="due_day" min={1} max={28} defaultValue={settings?.due_day ?? 15} />
          </div>
          <SaveBar />
        </form>
      </FormCard>

      <FormCard id="numbers" title={t("membership.numberRange")} description={t("membership.numberRangeHint")}>
        <NumberRangeForm t={t} kind="member" range={range} label={t("membership.numberFormat")} action={saveMemberRange} />
      </FormCard>

      <FormCard id="portal" title={t("portal.title")} description={t("membership.portalHint")}>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{siteUrl(ctx.org.slug, "/portal")}</span>
          <CopyButton value={siteUrl(ctx.org.slug, "/portal")} label={t("common.copy")} />
        </div>
      </FormCard>

      {(param(sp, "new") === "type" || edit) && (
        <UrlSheet params={["new", "edit"]} title={edit ? edit.name : t("membership.addType")}>
          <TypeForm t={t} type={edit} />
        </UrlSheet>
      )}
    </Page>
  )
}

function TypeForm({ t, type }: { t: T; type?: Tables<"membership_types"> }) {
  const id = type?.id ?? "new"
  return (
    <div className="grid gap-6">
      <form action={saveType} className="grid gap-4">
        {type && <input type="hidden" name="id" value={type.id} />}
        <Field id={`t-name-${id}`} name="name" label={t("membership.typeName")} required maxLength={100} defaultValue={type?.name ?? ""} placeholder={type ? undefined : t("membership.typePlaceholder")} />
        <div className="grid grid-cols-2 gap-4">
          <div className="grid content-start gap-2">
            <Label htmlFor={`t-fee-${id}`}>{t("membership.fee")}</Label>
            <TypedInput kind="money" id={`t-fee-${id}`} name="fee" defaultValue={type?.fee_cents ? formatMoney(type.fee_cents) : ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={`t-int-${id}`}>{t("membership.interval")}</Label>
            <NativeSelect id={`t-int-${id}`} name="interval" defaultValue={type?.interval ?? "year"} className="w-full">
              {INTERVALS.map((i) => (
                <NativeSelectOption key={i} value={i}>
                  {t(`membership.intervals.${i as Interval}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={`t-entry-${id}`}>{t("membership.entryFee")}</Label>
            <TypedInput kind="money" id={`t-entry-${id}`} name="entry_fee" defaultValue={type?.entry_fee_cents ? formatMoney(type.entry_fee_cents) : ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={`t-notice-${id}`}>{t("membership.noticeMonths")}</Label>
            <TypedInput kind="number" id={`t-notice-${id}`} name="notice_months" min={0} max={24} defaultValue={type?.notice_months ?? 3} />
          </div>
        </div>
        <div className="grid gap-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" name="prorate" value="on" defaultChecked={type?.prorate ?? false} />
            {t("membership.prorate")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" name="fee_is_minimum" value="on" defaultChecked={type?.fee_is_minimum ?? false} />
            {t("membership.feeIsMinimum")}
          </label>
          {type && (
            <label className="flex items-center gap-2 text-sm">
              <input type="hidden" name="active" value="off" />
              <input type="checkbox" className="size-4 accent-primary" name="active" value="on" defaultChecked={type.active} />
              {t("membership.typeActive")}
            </label>
          )}
        </div>
        <SubmitButton className="justify-self-end">{type ? t("common.save") : t("membership.addType")}</SubmitButton>
      </form>
      {type && (
        <form action={deleteType} className="border-t pt-4">
          <input type="hidden" name="id" value={type.id} />
          <SubmitButton size="sm" variant="ghost" className="text-destructive">
            <Trash2Icon /> {t("membership.deleteType")}
          </SubmitButton>
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
