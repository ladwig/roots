import Link from "next/link"
import { notFound } from "next/navigation"
import { ContactIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { contactName } from "@/app/(app)/contacts/fields"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param, type SearchParams } from "@/lib/url"
import { earliestEnd, type Interval } from "@/members/dues"
import { loadFields, type FieldDef } from "@/lib/custom-fields"
import { IdCard } from "@/members/id-card"
import { DateField, Field, MembershipFields, TYPE_COLS, type Type } from "../membership-parts"
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
    .select("id, description, amount_cents, due_on, status, paid_on, run_id")
    .eq("org_id", ctx.org.id)
    .eq("membership_id", m.id)
    .order("due_on", { ascending: false })
    .limit(100)
  const type = types.find((x) => x.id === m.type_id)
  const here = `/members/${m.id}`
  const name = m.contacts ? contactName(m.contacts) : ""

  const active = canManage && !m.deleted_at
  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/members", label: t("membership.nav") }, { label: name }]}
        title={name}
        badge={m.deleted_at && <Badge variant="destructive">{t("membership.filters.trash")}</Badge>}
        meta={[m.member_no && t("membership.numberShort", { number: m.member_no }), type?.name].filter(Boolean).join(" · ")}
        actions={
          m.contacts && (
            <Button render={<Link href={`/contacts/${m.contacts.id}`} />} nativeButton={false} size="sm" variant="outline">
              <ContactIcon /> {t("membership.openContact")}
            </Button>
          )
        }
        menu={
          active &&
          !dues?.length && (
            <ActionsMenu>
              <MenuSubmit form="trash-membership" icon={<Trash2Icon />} destructive>
                {t("membership.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
      />
      {active && !dues?.length && (
        <form id="trash-membership" action={trashMembership} hidden>
          <input type="hidden" name="id" value={m.id} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {m.deleted_at && (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("membership.deletedOn", { date: t.date(m.deleted_at), purge: t.date(new Date(new Date(m.deleted_at).getTime() + 30 * 86_400_000)) })}
          </p>
          {canManage && (
            <form action={restoreMembership}>
              <input type="hidden" name="id" value={m.id} />
              <SubmitButton>{t("membership.restore")}</SubmitButton>
            </form>
          )}
        </div>
      )}
      <RecordLayout
        aside={
          <>
            {m.contacts?.member_code && !m.deleted_at && (
              <FormCard id="card" title={t("membership.card")} description={t("membership.cardHint")}>
                <IdCard t={t} org={ctx.org.name} name={name} number={m.member_no} type={type?.name ?? null} code={m.contacts.member_code} />
                {canManage && (
                  <form action={resetMemberCode}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="contact" value={m.contacts.id} />
                    <SubmitButton size="sm" variant="outline">
                      {t("membership.cardReset")}
                    </SubmitButton>
                  </form>
                )}
              </FormCard>
            )}

            <FormCard id="dues" title={t("membership.tabs.dues")}>
              {dues?.length ? (
                <ul className="grid gap-1">
                  {dues.map((d) => (
                    <li key={d.id} className="grid gap-1 rounded-md border px-2.5 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{d.description}</span>
                        <span className="font-medium tabular-nums">{t.money(d.amount_cents)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t.date(d.due_on)}</span>
                        <Badge variant={d.status === "paid" ? "default" : d.status === "open" ? "secondary" : "outline"}>{t(`membership.dueStatus.${d.status as "open" | "paid" | "cancelled"}`)}</Badge>
                        <span className="ml-auto flex gap-1">
                          {canManage && d.status === "open" && d.due_on < today() && (
                            <form action={sendReminders}>
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="back" value={here} />
                              <SubmitButton size="xs" variant="ghost">
                                {t("membership.remind")}
                              </SubmitButton>
                            </form>
                          )}
                          {canManage && d.status === "paid" && !d.run_id && (
                            // Marked paid by hand (not collected by SEPA): can be undone after a misclick.
                            <form action={setDueStatus}>
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="status" value="open" />
                              <input type="hidden" name="back" value={here} />
                              <SubmitButton size="xs" variant="ghost">
                                {t("membership.markOpen")}
                              </SubmitButton>
                            </form>
                          )}
                          {canManage && d.status === "open" && (
                            <form action={setDueStatus}>
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="status" value="paid" />
                              <input type="hidden" name="back" value={here} />
                              <SubmitButton size="xs" variant="outline">
                                {t("membership.markPaid")}
                              </SubmitButton>
                            </form>
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("membership.noDues")}</p>
              )}
            </FormCard>

            {active && (!m.ends_on || m.ends_on >= today()) && (
              <FormCard id="pause" title={t("membership.pause")} description={!(m.paused_from && (!m.paused_until || m.paused_until >= today())) ? t("membership.pauseHint") : undefined}>
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
                    <div className="grid grid-cols-2 gap-3">
                      <DateField id="m-pause-from" name="paused_from" label={t("membership.pauseFrom")} defaultValue={today()} />
                      <DateField id="m-pause-until" name="paused_until" label={t("membership.pauseUntil")} />
                    </div>
                    <Field id="m-pause-reason" name="pause_reason" label={t("membership.pauseReason")} maxLength={300} />
                    <SubmitButton variant="outline" size="sm" className="justify-self-start">
                      {t("membership.pause")}
                    </SubmitButton>
                  </form>
                )}
              </FormCard>
            )}

            {active && !m.ends_on && type && (
              <FormCard
                id="cancel"
                title={t("membership.cancel")}
                description={t("membership.cancelHint", { date: t.date(earliestEnd(today(), type.notice_months, type.interval as Interval)), months: type.notice_months })}
              >
                <form action={endMembership} className="grid gap-3">
                  <input type="hidden" name="id" value={m.id} />
                  <DateField id="m-cancel" name="ends_on" label={t("membership.cancelOtherDate")} />
                  <SubmitButton variant="outline" size="sm" className="justify-self-start">
                    {t("membership.cancel")}
                  </SubmitButton>
                </form>
              </FormCard>
            )}

            <FileList ctx={ctx} entity="memberships" entityId={m.id} back={here} />
          </>
        }
      >
        <form action={saveMembership} className="grid gap-6">
          <input type="hidden" name="id" value={m.id} />
          <fieldset disabled={!active} className="grid gap-6">
            <MembershipFields t={t} types={types} m={m} defs={defs} />
            {active && <SaveBar />}
          </fieldset>
        </form>
      </RecordLayout>
    </Page>
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
