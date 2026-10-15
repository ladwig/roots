import { notFound } from "next/navigation"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { formatMoney } from "@/lib/inputs"
import type { Tables } from "@/lib/supabase/types"
import { param } from "@/lib/url"
import { INTERVALS, type Interval } from "@/members/dues"
import Link from "next/link"
import { deleteType, saveType } from "../actions"
import { Field } from "../membership-parts"

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export default async function MembershipTypesPage({ searchParams }: PageProps<"/members/types">) {
  const ctx = await requirePerm("members.manage")
  if (!ctx.modules.has("members")) notFound()
  const t = await getT()
  const sp = await searchParams
  const now = today()
  const [{ data: types }, { data: active }] = await Promise.all([
    ctx.supabase.from("membership_types").select("*").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("type_id").eq("org_id", ctx.org.id).is("deleted_at", null).lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`),
  ])
  const counts = new Map<string, number>()
  for (const m of active ?? []) counts.set(m.type_id, (counts.get(m.type_id) ?? 0) + 1)
  const rows = types ?? []
  const editing = param(sp, "edit")
  const edit = rows.find((x) => x.id === editing)

  return (
    <Page size="list">
      <PageHeader
        area="members"
        title={t("membership.types")}
        meta={t("membership.typesMeta", { active: rows.filter((x) => x.active).length, total: rows.length })}
        description={t("membership.typesHint")}
        settings={{ href: "/members/settings", label: t("common.settings") }}
        primary={{ href: "/members/types?new=type", label: t("membership.newType") }}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {rows.length ? (
        <DataTable
          rows={rows}
          rowKey={(x) => x.id}
          empty={t("membership.noTypes")}
          rowHref={(x) => `/members/types?edit=${x.id}`}
          columns={[
            {
              header: t("membership.typeName"),
              cell: (x) => (
                <span className="grid">
                  <span className="font-medium">{x.name}</span>
                  {(x.prorate || x.fee_is_minimum) && (
                    <span className="text-xs text-muted-foreground">
                      {[x.prorate && t("membership.prorate"), x.fee_is_minimum && t("membership.feeIsMinimum")].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              ),
            },
            {
              header: t("membership.fee"),
              cell: (x) =>
                x.fee_cents === 0 && x.interval === "none"
                  ? t("membership.feeNone")
                  : `${x.fee_is_minimum ? t("membership.feeFrom", { fee: t.money(x.fee_cents) }) : t.money(x.fee_cents)} / ${t(`membership.intervals.${x.interval as Interval}`)}`,
            },
            { header: t("membership.entryFee"), cell: (x) => (x.entry_fee_cents ? t.money(x.entry_fee_cents) : "–") },
            { header: t("membership.noticeShort"), cell: (x) => (x.notice_months ? t("membership.noticeValue", { n: x.notice_months }) : t("membership.noticeNone")) },
            { header: t("membership.typeMembers"), cell: (x) => <span className="tabular-nums">{counts.get(x.id) ?? 0}</span> },
            { header: t("membership.status"), cell: (x) => (x.active ? <Badge>{t("membership.state.active")}</Badge> : <Badge variant="outline">{t("membership.typeInactive")}</Badge>) },
          ]}
        />
      ) : (
        <EmptyState
          area="members"
          title={t("membership.noTypes")}
          action={
            <Button render={<Link href="/members/types?new=type" />} nativeButton={false}>
              <PlusIcon /> {t("membership.newType")}
            </Button>
          }
        />
      )}

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
        <SaveBar label={type ? undefined : t("membership.addType")} always={!type} />
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

export const instant = false
