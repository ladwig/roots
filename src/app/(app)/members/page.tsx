import Link from "next/link"
import { UploadIcon } from "lucide-react"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { ContactPicker } from "@/components/contact-picker"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { pageParam, param, withParams, type SearchParams } from "@/lib/url"
import { earliestEnd, type Interval } from "@/members/dues"
import { endMembership, restoreMembership, saveMembership, sendReminders, setDueStatus, trashMembership } from "./actions"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
type Type = Pick<Tables<"membership_types">, "id" | "name" | "fee_cents" | "interval" | "notice_months" | "active">
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("members.manage")
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const status = (["active", "ended", "all", "trash"] as const).find((s) => s === param(sp, "status") && (s !== "trash" || canManage)) ?? "active"
  const typeFilter = param(sp, "type")
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const creating = canManage && param(sp, "new") === "1"
  const now = today()

  let query = ctx.supabase
    .from("memberships")
    .select("id, number, member_no, starts_on, ends_on, type_id, contacts!inner(first_name, last_name, company, email)")
    .eq("org_id", ctx.org.id)
    .order("number")
    .range(...pageRange(page))
  query = status === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (status === "active") query = query.or(`ends_on.is.null,ends_on.gte.${now}`)
  if (status === "ended") query = query.lt("ends_on", now)
  if (typeFilter) query = query.eq("type_id", typeFilter)
  if (q) query = query.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${q}%`).join(","), { referencedTable: "contacts" })
  const [{ data }, { data: types }, { count: activeCount }, { data: editing }, { data: preset }] = await Promise.all([
    query,
    ctx.supabase.from("membership_types").select("id, name, fee_cents, interval, notice_months, active").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null).lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`),
    editId
      ? ctx.supabase.from("memberships").select("*, contacts(id, first_name, last_name, company, email)").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    creating && param(sp, "contact")
      ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", param(sp, "contact")!).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const typeName = (id: string) => types?.find((x) => x.id === id)?.name ?? ""
  const chip = (href: string, current: boolean, label: string) => (
    <Link
      key={label}
      href={href}
      aria-current={current ? "true" : undefined}
      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )
  const state = (m: { starts_on: string; ends_on: string | null }) =>
    m.ends_on && m.ends_on < now ? (
      <Badge variant="outline">{t("membership.state.ended")}</Badge>
    ) : m.ends_on ? (
      <Badge variant="secondary">{t("membership.state.ending", { date: t.date(m.ends_on) })}</Badge>
    ) : m.starts_on > now ? (
      <Badge variant="secondary">{t("membership.state.upcoming", { date: t.date(m.starts_on) })}</Badge>
    ) : (
      <Badge>{t("membership.state.active")}</Badge>
    )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("membership.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("membership.activeCount", { count: activeCount ?? 0 })}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {ctx.can("crm.manage") && (
              <Button render={<Link href="/members/import" />} nativeButton={false} size="sm" variant="outline">
                <UploadIcon /> {t("membership.import")}
              </Button>
            )}
            <Button render={<Link href={withParams(sp, { new: "1", edit: undefined })} scroll={false} />} nativeButton={false} size="sm" disabled={!types?.length}>
              {t("membership.new")}
            </Button>
          </div>
        )}
      </div>
      <Notice error={!editId && !creating ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />
      {!types?.length && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("membership.noTypes")}{" "}
          {canManage && (
            <Link href="/members/setup" className="underline">
              {t("membership.tabs.setup")}
            </Link>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} keep={{ ...(status !== "active" && { status }), ...(typeFilter && { type: typeFilter }) }} />
        <nav aria-label={t("membership.filter")} className="flex flex-wrap gap-1.5">
          {(["active", "ended", "all", ...(canManage ? (["trash"] as const) : [])] as const).map((s) =>
            chip(withParams(sp, { status: s === "active" ? undefined : s, page: undefined, edit: undefined }), s === status, t(`membership.filters.${s}`)),
          )}
          {(types ?? []).map((x) => chip(withParams(sp, { type: x.id === typeFilter ? undefined : x.id, page: undefined, edit: undefined }), x.id === typeFilter, x.name))}
        </nav>
      </div>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={q || typeFilter ? t("membership.noMatch") : t("membership.empty")}
        columns={[
          {
            header: t("membership.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.contacts ? contactName(r.contacts) : ""}</span>
                <span className="text-xs text-muted-foreground">{t("membership.numberShort", { number: r.member_no ?? "" })}</span>
              </span>
            ),
          },
          { header: t("membership.type"), cell: (r) => typeName(r.type_id) },
          { header: t("membership.since"), cell: (r) => t.date(r.starts_on), className: "whitespace-nowrap" },
          { header: t("membership.status"), cell: (r) => state(r) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {creating && (
        <UrlSheet params={["new"]} title={t("membership.new")}>
          <Notice error={param(sp, "error")} />
          <form action={saveMembership} className="grid gap-4">
            <fieldset className="grid gap-4">
              <legend className="mb-2 font-medium">{t("membership.person")}</legend>
              <ContactPicker
                name="contact_id"
                label={t("membership.existingContact")}
                initial={preset ? { id: preset.id, label: contactName(preset), detail: preset.email ?? "" } : null}
              />
              <p className="text-xs text-muted-foreground">{t("membership.newContactHint")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="m-first" name="first_name" label={t("contacts.firstName")} maxLength={100} autoComplete="off" />
                <Field id="m-last" name="last_name" label={t("contacts.lastName")} maxLength={100} autoComplete="off" />
              </div>
              <Field id="m-email" name="email" type="email" label={t("contacts.email")} maxLength={320} autoComplete="off" />
            </fieldset>
            <Separator />
            <MembershipFields t={t} types={types ?? []} />
            <SubmitButton className="justify-self-start">{t("membership.create")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
      {editing && <EditMembership t={t} ctx={ctx} m={editing} types={types ?? []} sp={sp} canManage={canManage} />}
    </>
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

function MembershipFields({ t, types, m }: { t: T; types: Type[]; m?: Tables<"memberships"> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="m-type">{t("membership.type")}</Label>
          <NativeSelect id="m-type" name="type_id" required defaultValue={m?.type_id ?? types.find((x) => x.active)?.id ?? ""} className="w-full">
            {types
              .filter((x) => x.active || x.id === m?.type_id)
              .map((x) => (
                <NativeSelectOption key={x.id} value={x.id}>
                  {x.name} · {t.money(x.fee_cents)} / {t(`membership.intervals.${x.interval as Interval}`)}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
        <Field id="m-start" name="starts_on" type="date" required label={t("membership.since")} defaultValue={m?.starts_on ?? today()} />
      </div>
      {m && <Field id="m-end" name="ends_on" type="date" label={t("membership.until")} defaultValue={m.ends_on ?? ""} />}
      <fieldset className="grid gap-4">
        <legend className="mb-1 font-medium">{t("membership.mandate")}</legend>
        <p className="text-xs text-muted-foreground">{t("membership.mandateHint")}</p>
        <Field id="m-holder" name="account_holder" label={t("membership.accountHolder")} maxLength={70} defaultValue={m?.account_holder ?? ""} />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="m-iban" name="iban" label="IBAN" maxLength={40} defaultValue={m?.iban ?? ""} autoComplete="off" />
          <Field id="m-bic" name="bic" label={t("membership.bicOptional")} maxLength={11} defaultValue={m?.bic ?? ""} autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="m-ref" name="mandate_ref" label={t("membership.mandateRef")} maxLength={35} defaultValue={m?.mandate_ref ?? ""} placeholder={t("membership.mandateRefAuto")} />
          <Field id="m-signed" name="mandate_signed_on" type="date" label={t("membership.mandateSigned")} defaultValue={m?.mandate_signed_on ?? ""} />
        </div>
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="m-note">{t("membership.note")}</Label>
        <textarea
          id="m-note"
          name="note"
          rows={3}
          maxLength={5000}
          defaultValue={m?.note ?? ""}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>
    </>
  )
}

async function EditMembership({
  t,
  ctx,
  m,
  types,
  sp,
  canManage,
}: {
  t: T
  ctx: Ctx
  m: Tables<"memberships"> & { contacts: { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null } | null }
  types: Type[]
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
  const here = `/members?edit=${m.id}`
  const name = m.contacts ? contactName(m.contacts) : ""

  return (
    <UrlSheet params={["edit"]} title={name} description={t("membership.numberShort", { number: m.member_no ?? "" })}>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {m.contacts && (
        <Button render={<Link href={`/contacts?edit=${m.contacts.id}`} />} nativeButton={false} size="sm" variant="outline" className="justify-self-start">
          {t("membership.openContact")}
        </Button>
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
          <MembershipFields t={t} types={types} m={m} />
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
    </UrlSheet>
  )
}

export const instant = false
