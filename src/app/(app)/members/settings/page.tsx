import { notFound, redirect } from "next/navigation"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CopyButton } from "@/components/copy-button"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { NumberRangeForm } from "@/components/number-range-form"
import { saveMemberRange, saveSettings } from "../actions"

export default async function MembersSetupPage({ searchParams }: PageProps<"/members/settings">) {
  const ctx = await requirePerm("members.manage")
  if (!ctx.modules.has("members")) notFound()
  const t = await getT()
  const sp = await searchParams
  // Old links: membership types moved to their own page.
  const typeParams = ["new", "edit"].filter((k) => param(sp, k)).map((k) => `${k}=${encodeURIComponent(param(sp, k)!)}`)
  if (typeParams.length) redirect(`/members/types?${typeParams.join("&")}`)
  const [{ data: settings }, { data: range }] = await Promise.all([
    ctx.supabase.from("member_settings").select("*").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("number_ranges").select("format, next_number, yearly_reset").eq("org_id", ctx.org.id).eq("kind", "member").maybeSingle(),
  ])

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/members", label: t("membership.nav") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

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

    </Page>
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
