import Link from "next/link"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { ExportMenu } from "@/components/export-menu"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CONTACT_INPUTS, type Submission } from "@/forms/elements"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { acceptSubmission, rejectSubmission } from "../../actions"

type Status = "new" | "accepted" | "rejected"

export default async function SubmissionsPage({ params, searchParams }: PageProps<"/forms/[id]/submissions">) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requirePerm("forms.view")
  const t = await getT()
  const canManage = ctx.can("forms.manage")
  const status = (["new", "accepted", "rejected", "all"] as const).find((s) => s === param(sp, "status")) ?? "all"
  const page = pageParam(sp)
  const openId = param(sp, "sub")
  const here = `/forms/${id}/submissions`

  let query = ctx.supabase
    .from("form_submissions")
    .select("id, email, status, created_at, data")
    .eq("org_id", ctx.org.id)
    .eq("form_id", id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (status !== "all") query = query.eq("status", status)
  const [{ data }, { data: form }, { data: open }] = await Promise.all([
    query,
    ctx.supabase.from("forms").select("purpose").eq("id", id).eq("org_id", ctx.org.id).single(),
    openId
      ? ctx.supabase.from("form_submissions").select("*").eq("id", openId).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const { data: types } = form?.purpose === "membership" ? await ctx.supabase.from("membership_types").select("id, name").eq("org_id", ctx.org.id) : { data: [] }
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const name = (d: unknown) => {
    const c = (d as Submission).contact
    return [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.company || c?.email || "–"
  }
  const badge = (s: string) => <Badge variant={s === "new" ? "secondary" : s === "accepted" ? "default" : "outline"}>{t(`forms.subStatus.${s as Status}`)}</Badge>
  const chip = (s: (typeof status)) => (
    <Link
      key={s}
      href={withParams(sp, { status: s === "all" ? undefined : s, page: undefined, sub: undefined })}
      aria-current={s === status ? "true" : undefined}
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
    >
      {s === "all" ? t("forms.all") : t(`forms.subStatus.${s}`)}
    </Link>
  )
  const sub = open ? { ...open, data: open.data as unknown as Submission } : null

  return (
    <>
      <Notice error={!openId ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("forms.status")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {(["all", "new", "accepted", "rejected"] as const).map(chip)}
        </nav>
        <ExportMenu entity="submissions" query={{ form: id }} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { sub: r.id })}
        empty={t("forms.noSubmissions")}
        columns={[
          { header: t("forms.person"), cell: (r) => <span className="font-medium">{name(r.data)}</span> },
          { header: t("contacts.email"), cell: (r) => <span className="break-all">{r.email}</span> },
          { header: t("forms.received"), cell: (r) => t.date(r.created_at, { dateStyle: "medium", timeStyle: "short" }), className: "whitespace-nowrap" },
          { header: t("forms.status"), cell: (r) => badge(r.status) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {sub && (
        <UrlSheet params={["sub"]} title={name(sub.data)} description={t.date(sub.created_at, { dateStyle: "full", timeStyle: "short" })}>
          <Notice error={param(sp, "error")} />
          <div className="flex flex-wrap items-center gap-2">
            {badge(sub.status)}
            {sub.contact_id && (
              <Button render={<Link href={`/contacts/${sub.contact_id}`} />} nativeButton={false} size="sm" variant="outline">
                {t("forms.openContact")}
              </Button>
            )}
            {sub.membership_id && (
              <Button render={<Link href={`/members/${sub.membership_id}`} />} nativeButton={false} size="sm" variant="outline">
                {t("forms.openMembership")}
              </Button>
            )}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
            {Object.entries(sub.data.contact ?? {})
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <Row key={k} label={CONTACT_INPUTS[k] ? t.dynamic(CONTACT_INPUTS[k].label) : k} value={String(v)} />
              ))}
            {Object.entries(sub.data.custom ?? {}).map(([k, v]) => (
              <Row key={k} label={k} value={String(v)} />
            ))}
            {sub.data.membership && (
              <>
                <Row label={t("forms.fields.membershipType")} value={types?.find((x) => x.id === sub.data.membership!.type_id)?.name ?? "–"} />
                {sub.data.membership.starts_on && <Row label={t("forms.fields.startsOn")} value={t.date(sub.data.membership.starts_on)} />}
                {sub.data.membership.iban && <Row label="IBAN" value={sub.data.membership.iban} />}
                {sub.data.membership.account_holder && <Row label={t("forms.accountHolder")} value={sub.data.membership.account_holder} />}
              </>
            )}
            {sub.data.consents?.map((c, i) => (
              <Row key={i} label={c.accepted ? "✓" : "✗"} value={c.label} />
            ))}
          </dl>
          {canManage && sub.status === "new" && (
            <div className="flex flex-wrap gap-2">
              <form action={acceptSubmission}>
                <input type="hidden" name="id" value={sub.id} />
                <input type="hidden" name="back" value={`${here}?sub=${sub.id}`} />
                <SubmitButton>{t(form?.purpose === "membership" ? "forms.acceptMember" : "forms.accept")}</SubmitButton>
              </form>
              <form action={rejectSubmission}>
                <input type="hidden" name="id" value={sub.id} />
                <input type="hidden" name="back" value={`${here}?sub=${sub.id}`} />
                <SubmitButton variant="outline">{t("forms.reject")}</SubmitButton>
              </form>
            </div>
          )}
        </UrlSheet>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-line">{value}</dd>
    </>
  )
}

export const instant = false
