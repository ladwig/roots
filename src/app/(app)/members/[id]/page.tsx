import Link from "next/link"
import { notFound } from "next/navigation"
import { PageCrumbs } from "@/components/page-crumbs"
import { contactName } from "@/app/(app)/contacts/fields"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param, type SearchParams } from "@/lib/url"
import { earliestEnd, type Interval } from "@/members/dues"
import { loadFields, type FieldDef } from "@/lib/custom-fields"
import { IdCard } from "@/members/id-card"
import { Field, MembershipFields, TYPE_COLS, type Type } from "../membership-parts"
import { endMembership, pauseMembership, resetMemberCode, restoreMembership, resumeMembership, saveMembership, sendReminders, setDueStatus, trashMembership } from "../actions"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

async function MembershipBody({
  t,
  ctx,
  m,
  types,
  defs,
  sp,
  canManage,
}: {
  t: T
  ctx: Ctx
  m: Tables<"memberships"> & { contacts: { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null; member_code: string | null } | null }
  types: Type[]
  defs: FieldDef[]
  sp: SearchParams
  canManage: boolean
}) {
  const { data: dues } = await ctx.supabase
    .from("member_dues")
    .select("id, description, amount_cents, due_on, status, paid_on")
    .eq("org_id", ctx.org.id)
    .eq("membership_id", m.id)
    .order("due_on", { ascending: false })
    .limit(100)
  const type = types.find((x) => x.id === m.type_id)
  const here = `/members/${m.id}`
  const name = m.contacts ? contactName(m.contacts) : ""

  return (
    <div className="grid max-w-3xl gap-6">
      <PageCrumbs items={[{ href: "/members", label: t("membership.nav") }, { label: name }]} />
      <header className="grid gap-1">
        <h1 className="font-heading text-2xl font-semibold break-words">{name}</h1>
        {m.member_no && <p className="text-sm text-muted-foreground">{t("membership.numberShort", { number: m.member_no })}</p>}
      </header>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {m.contacts && (
        <Button render={<Link href={`/contacts/${m.contacts.id}`} />} nativeButton={false} size="sm" variant="outline" className="justify-self-start">
          {t("membership.openContact")}
        </Button>
      )}
      {m.contacts?.member_code && !m.deleted_at && (
        <section className="grid gap-3 text-sm" aria-labelledby="m-card">
          <h3 id="m-card" className="font-medium">
            {t("membership.card")}
          </h3>
          <div className="grid gap-3">
            <IdCard t={t} org={ctx.org.name} name={name} number={m.member_no} type={type?.name ?? null} code={m.contacts.member_code} />
            <p className="text-muted-foreground">{t("membership.cardHint")}</p>
            {canManage && (
              <form action={resetMemberCode}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="contact" value={m.contacts.id} />
                <SubmitButton size="sm" variant="outline">
                  {t("membership.cardReset")}
                </SubmitButton>
              </form>
            )}
          </div>
        </section>
      )}
      {m.deleted_at && (
        <>
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("membership.deletedOn", { date: t.date(m.deleted_at), purge: t.date(new Date(new Date(m.deleted_at).getTime() + 30 * 86_400_000)) })}
          </p>
          {canManage && (
            <form action={restoreMembership}>
              <input type="hidden" name="id" value={m.id} />
              <SubmitButton className="justify-self-start">{t("membership.restore")}</SubmitButton>
            </form>
          )}
        </>
      )}
      <form action={saveMembership} className="grid gap-4">
        <input type="hidden" name="id" value={m.id} />
        <fieldset disabled={!canManage || !!m.deleted_at} className="grid gap-4">
          <MembershipFields t={t} types={types} m={m} defs={defs} />
        </fieldset>
        {canManage && !m.deleted_at && <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>}
      </form>

      {canManage && !m.ends_on && !m.deleted_at && type && (
        <>
          <Separator />
          <form action={endMembership} className="grid gap-3">
            <input type="hidden" name="id" value={m.id} />
            <h3 className="font-medium">{t("membership.cancel")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("membership.cancelHint", { date: t.date(earliestEnd(today(), type.notice_months, type.interval as Interval)), months: type.notice_months })}
            </p>
            <Field id="m-cancel" name="ends_on" type="date" label={t("membership.cancelOtherDate")} />
            <SubmitButton variant="outline" size="sm" className="justify-self-start">
              {t("membership.cancel")}
            </SubmitButton>
          </form>
        </>
      )}

      {canManage && !m.deleted_at && (!m.ends_on || m.ends_on >= today()) && (
        <>
          <Separator />
          <section className="grid gap-3" aria-labelledby="m-pause">
            <h3 id="m-pause" className="font-medium">
              {t("membership.pause")}
            </h3>
            {m.paused_from && (!m.paused_until || m.paused_until >= today()) ? (
              <form action={resumeMembership} className="grid gap-3">
                <input type="hidden" name="id" value={m.id} />
                <p className="text-sm">
                  {m.paused_until
                    ? t("membership.pausedRange", { from: t.date(m.paused_from), until: t.date(m.paused_until) })
                    : t("membership.pausedOpen", { from: t.date(m.paused_from) })}
                  {m.pause_reason && ` · ${m.pause_reason}`}
                </p>
                <SubmitButton variant="outline" size="sm" className="justify-self-start">
                  {t("membership.resume")}
                </SubmitButton>
              </form>
            ) : (
              <form action={pauseMembership} className="grid gap-3">
                <input type="hidden" name="id" value={m.id} />
                <p className="text-sm text-muted-foreground">{t("membership.pauseHint")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="m-pause-from" name="paused_from" type="date" label={t("membership.pauseFrom")} defaultValue={today()} />
                  <Field id="m-pause-until" name="paused_until" type="date" label={t("membership.pauseUntil")} />
                </div>
                <Field id="m-pause-reason" name="pause_reason" label={t("membership.pauseReason")} maxLength={300} />
                <SubmitButton variant="outline" size="sm" className="justify-self-start">
                  {t("membership.pause")}
                </SubmitButton>
              </form>
            )}
          </section>
        </>
      )}

      <Separator />
      <section className="grid gap-3" aria-labelledby="m-dues">
        <h3 id="m-dues" className="font-medium">
          {t("membership.tabs.dues")}
        </h3>
        {dues?.length ? (
          <ul className="grid gap-1">
            {dues.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{d.description}</span>
                <span className="text-xs text-muted-foreground">{t.date(d.due_on)}</span>
                <span className="font-medium tabular-nums">{t.money(d.amount_cents)}</span>
                <Badge variant={d.status === "paid" ? "default" : d.status === "open" ? "secondary" : "outline"}>{t(`membership.dueStatus.${d.status as "open" | "paid" | "cancelled"}`)}</Badge>
                {canManage && d.status === "open" && d.due_on < today() && (
                  <form action={sendReminders}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="back" value={here} />
                    <SubmitButton size="sm" variant="ghost">
                      {t("membership.remind")}
                    </SubmitButton>
                  </form>
                )}
                {canManage && d.status === "open" && (
                  <form action={setDueStatus}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="status" value="paid" />
                    <input type="hidden" name="back" value={here} />
                    <SubmitButton size="sm" variant="ghost">
                      {t("membership.markPaid")}
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("membership.noDues")}</p>
        )}
      </section>

      <Separator />
      <FileList ctx={ctx} entity="memberships" entityId={m.id} back={here} />

      {canManage && !dues?.length && !m.deleted_at && (
        <>
          <Separator />
          <form action={trashMembership}>
            <input type="hidden" name="id" value={m.id} />
            <SubmitButton variant="outline" size="sm">
              {t("membership.toTrash")}
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  )
}


// One membership as a page: data, fees, pause, member card, cancellation, dues, files.
export default async function MembershipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const [{ data: m }, { data: types }, defs] = await Promise.all([
    ctx.supabase.from("memberships").select("*, contacts(id, first_name, last_name, company, email, member_code)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "memberships"),
  ])
  if (!m) notFound()
  return <MembershipBody t={t} ctx={ctx} m={m} types={types ?? []} defs={defs} sp={sp} canManage={ctx.can("members.manage")} />
}

export const instant = false
