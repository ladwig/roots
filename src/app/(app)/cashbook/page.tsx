import Link from "next/link"
import { TypedInput } from "@/components/typed-input"
import { ActionsMenu, MenuExport, MenuLink } from "@/components/actions-menu"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon, PaperclipIcon, PencilIcon, PlusIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { UrlSheet } from "@/components/url-sheet"
import { ACCOUNT_KINDS, SPHERES } from "@/cashbook/fields"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param, withParams, type SearchParams } from "@/lib/url"
import { bookCashEntry, closeCashMonth, reverseCashEntry, saveAccount } from "./actions"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
type Entry = Tables<"cash_entries">

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)

// Cash book: one account at a time, one month at a time (both in the URL). Entries are booked, never edited; a
// mistake is reversed. A finished month can be closed with a cash count, then it takes no more entries.
export default async function CashbookPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("cashbook.view")
  if (!ctx.modules.has("cashbook")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("cashbook.manage")
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month") ?? "") ? param(sp, "month")! : today.slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const first = `${month}-01`
  const last = iso(y, m, 0)
  const before = iso(y, m - 1, 0)

  // With ?account= everything loads in one round; without it the default account has to be found first.
  const wanted = /^[0-9a-f-]{36}$/.test(param(sp, "account") ?? "") ? param(sp, "account")! : null
  const accountsQuery = ctx.supabase.from("cash_accounts").select("*").eq("org_id", ctx.org.id).order("active", { ascending: false }).order("name")
  const initial = wanted ? null : (await accountsQuery).data
  const pick = (list: Tables<"cash_accounts">[] | null | undefined) => list?.find((a) => a.id === wanted) ?? list?.find((a) => a.active) ?? list?.[0]
  const preliminary = wanted ?? pick(initial)?.id ?? null
  const editId = param(sp, "edit")
  const [{ data: listed }, { data: entries }, { data: start }, { data: closing }, { data: cats }, { data: invoices }, { data: editing }] = await Promise.all([
    wanted ? accountsQuery : Promise.resolve({ data: initial }),
    preliminary
      ? ctx.supabase.from("cash_entries").select("*").eq("org_id", ctx.org.id).eq("account_id", preliminary).gte("booked_on", first).lte("booked_on", last).order("booked_on").order("number")
      : Promise.resolve({ data: [] as Entry[] }),
    preliminary ? ctx.supabase.rpc("cash_balances", { p_org: ctx.org.id, p_until: before }) : Promise.resolve({ data: [] }),
    preliminary ? ctx.supabase.from("cash_closings").select("*").eq("account_id", preliminary).eq("month", first).maybeSingle() : Promise.resolve({ data: null }),
    canManage ? ctx.supabase.from("cash_entries").select("category").eq("org_id", ctx.org.id).not("category", "is", null).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    canManage && param(sp, "new") === "entry" && ctx.modules.has("invoices")
      ? ctx.supabase.from("documents").select("id, number, recipient_name, gross_total").eq("org_id", ctx.org.id).eq("kind", "invoice").eq("status", "sent").order("issue_date", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
    editId && /^[0-9a-f-]{36}$/.test(editId) ? ctx.supabase.from("cash_entries").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const accounts = listed
  const account = accounts?.find((a) => a.id === preliminary) // an unknown ?account= shows the empty state
  const ids = (entries ?? []).map((e) => e.id)
  const [{ data: reversals }, { data: receipts }] = await Promise.all([
    ids.length ? ctx.supabase.from("cash_entries").select("reverses_id, number").in("reverses_id", ids) : Promise.resolve({ data: [] }),
    ids.length && ctx.can("org.files.view") ? ctx.supabase.from("files").select("entity_id").eq("entity", "cash_entries").in("entity_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ])
  const reversedBy = new Map((reversals ?? []).map((r) => [r.reverses_id!, r.number]))
  const receiptCount = (id: string) => (receipts ?? []).filter((r) => r.entity_id === id).length
  const opening = Number((start ?? []).find((b) => b.account_id === account?.id)?.balance_cents ?? account?.opening_cents ?? 0)
  const sum = (entries ?? []).reduce((s, e) => s + e.amount_cents, 0)
  const income = (entries ?? []).filter((e) => e.amount_cents > 0).reduce((s, e) => s + e.amount_cents, 0)
  const ended = last < today
  const nav = (mm: number) => withParams(sp, { month: iso(y, mm, 1).slice(0, 7), edit: undefined })
  const money = (c: number) => t.money(c)

  return (
    <Page>
      <PageHeader
        area="finance"
        title={t("cashbook.title")}
        meta={account && closing && <Badge variant="secondary">{t("cashbook.monthClosed")}</Badge>}
        actions={
          canManage &&
          account && (
            <Button render={<Link href={`/cashbook${withParams(sp, { edit_account: account.id })}`} scroll={false} />} nativeButton={false} size="sm" variant="ghost">
              <PencilIcon /> {t("cashbook.editAccount")}
            </Button>
          )
        }
        menu={
          (account || canManage) && (
            <ActionsMenu>
              {canManage && (
                <MenuLink href={`/cashbook${withParams(sp, { new: "account" })}`} icon={<PlusIcon />}>
                  {t("cashbook.newAccount")}
                </MenuLink>
              )}
              {account && <MenuExport entity="cash_entries" query={{ account: account.id, month }} />}
            </ActionsMenu>
          )
        }
        primary={canManage && account && !closing ? { href: `/cashbook${withParams(sp, { new: "entry" })}`, label: t("cashbook.newEntry") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {!account ? (
        <EmptyState
          area="finance"
          title={t("cashbook.noAccounts")}
          action={
            canManage && (
              <Button render={<Link href={`/cashbook${withParams(sp, { new: "account" })}`} />} nativeButton={false} size="sm">
                <PlusIcon /> {t("cashbook.newAccount")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <nav aria-label={t("cashbook.accounts")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {accounts!.map((a) => (
              <Link
                key={a.id}
                href={`/cashbook?account=${a.id}&month=${month}`}
                aria-current={a.id === account.id ? "true" : undefined}
                className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
              >
                {a.name}
                {!a.active && ` · ${t("cashbook.inactive")}`}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Button render={<Link href={`/cashbook${nav(m - 2)}`} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("cashbook.prevMonth")}>
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-36 text-center font-medium">{t.date(first, { month: "long", year: "numeric" })}</span>
            <Button render={<Link href={`/cashbook${nav(m)}`} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("cashbook.nextMonth")}>
              <ChevronRightIcon />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t("cashbook.openingBalance")} value={money(opening)} />
            <Tile label={t("cashbook.income")} value={money(income)} />
            <Tile label={t("cashbook.expenses")} value={money(income - sum)} />
            <Tile label={t("cashbook.closingBalance")} value={money(opening + sum)} strong />
          </div>

          <DataTable
            rows={entries ?? []}
            rowKey={(e) => e.id}
            empty={t("cashbook.noEntries")}
            columns={[
              {
                header: t("cashbook.entry"),
                cell: (e) => (
                  <Link href={`/cashbook${withParams(sp, { edit: e.id, new: undefined })}`} className="grid underline-offset-4 hover:underline">
                    <span className="font-medium">{e.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.number} · {t.date(e.booked_on, { dateStyle: "medium" })}
                      {e.counterparty && ` · ${e.counterparty}`}
                    </span>
                  </Link>
                ),
              },
              { header: t("cashbook.category"), cell: (e) => e.category ?? "–" },
              { header: t("cashbook.sphere"), cell: (e) => (e.sphere ? t.dynamic(`cashbook.spheres.${e.sphere}`) : "–") },
              {
                header: t("cashbook.amount"),
                cell: (e) => (
                  <span className="flex flex-wrap items-center gap-2 tabular-nums">
                    <span className={e.amount_cents < 0 ? "text-destructive" : ""}>{money(e.amount_cents)}</span>
                    {receiptCount(e.id) > 0 && <PaperclipIcon className="size-3.5 text-muted-foreground" aria-label={t("cashbook.receipts")} />}
                    {(reversedBy.has(e.id) || e.reverses_id) && <Badge variant="outline">{e.reverses_id ? t("cashbook.reversal") : t("cashbook.reversedShort")}</Badge>}
                  </span>
                ),
              },
            ]}
          />

          <section className="grid gap-3 rounded-lg border p-4" aria-labelledby="closing">
            <h2 id="closing" className="font-medium">
              {t("cashbook.closing")}
            </h2>
            {closing ? (
              <p className="text-sm">
                {t("cashbook.closedInfo", { balance: money(closing.balance_cents), date: t.date(closing.created_at, { dateStyle: "medium" }) })}
                {closing.counted_cents != null &&
                  ` · ${t("cashbook.countedInfo", { counted: money(closing.counted_cents), diff: money(closing.counted_cents - closing.balance_cents) })}`}
                {closing.note && ` · ${closing.note}`}
              </p>
            ) : !ended ? (
              <p className="text-sm text-muted-foreground">{t("cashbook.closeLater")}</p>
            ) : canManage ? (
              <form action={closeCashMonth} className="grid gap-3">
                <input type="hidden" name="account_id" value={account.id} />
                <input type="hidden" name="month" value={month} />
                <p className="text-sm text-muted-foreground">{t("cashbook.closeHint", { balance: money(opening + sum) })}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {account.kind === "cash" && <Field id="c-counted" name="counted" label={t("cashbook.counted")} inputMode="decimal" placeholder="0,00" />}
                  <Field id="c-note" name="note" label={t("cashbook.note")} maxLength={1000} />
                </div>
                <SubmitButton size="sm" variant="outline" className="justify-self-start">
                  {t("cashbook.closeMonth")}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{t("cashbook.notClosed")}</p>
            )}
          </section>
        </>
      )}

      {canManage && account && param(sp, "new") === "entry" && (
        <UrlSheet params={["new"]} title={t("cashbook.newEntry")} description={account.name}>
          <Notice error={param(sp, "error")} />
          <EntryForm t={t} accountId={account.id} today={today} categories={[...new Set((cats ?? []).map((c) => c.category!))].slice(0, 100)} invoices={invoices ?? []} />
        </UrlSheet>
      )}
      {canManage && (param(sp, "new") === "account" || param(sp, "edit_account")) && (
        <UrlSheet params={["new", "edit_account"]} title={param(sp, "new") === "account" ? t("cashbook.newAccount") : t("cashbook.editAccount")}>
          <Notice error={param(sp, "error")} />
          <AccountForm t={t} a={param(sp, "new") === "account" ? undefined : accounts?.find((a) => a.id === param(sp, "edit_account"))} today={today} />
        </UrlSheet>
      )}
      {editing && <EntryDrawer t={t} ctx={ctx} e={editing} reversedBy={reversedBy.get(editing.id)} canManage={canManage} sp={sp} />}
    </Page>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-semibold tabular-nums" : "text-lg tabular-nums"}>{value}</span>
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

function EntryForm({ t, accountId, today, categories, invoices }: { t: T; accountId: string; today: string; categories: string[]; invoices: { id: string; number: string | null; recipient_name: string | null; gross_total: number }[] }) {
  return (
    <form action={bookCashEntry} className="grid gap-4">
      <input type="hidden" name="account_id" value={accountId} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">{t("cashbook.direction")}</legend>
        {(["in", "out"] as const).map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <input type="radio" name="direction" value={d} defaultChecked={d === "out"} className="size-4" />
            {t.dynamic(`cashbook.directions.${d}`)}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="e-amount">{t("cashbook.amount")}</Label>
          <TypedInput kind="money" id="e-amount" name="amount" required />
        </div>
        <Field id="e-date" name="booked_on" type="date" label={t("cashbook.date")} defaultValue={today} required />
      </div>
      <Field id="e-desc" name="description" label={t("cashbook.description")} maxLength={300} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="e-cat">{t("cashbook.category")}</Label>
          <Input id="e-cat" name="category" list="e-cats" maxLength={100} />
          <datalist id="e-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="e-sphere">{t("cashbook.sphere")}</Label>
          <NativeSelect id="e-sphere" name="sphere" defaultValue="" className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {SPHERES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {t.dynamic(`cashbook.spheres.${s}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Field id="e-party" name="counterparty" label={t("cashbook.counterparty")} maxLength={200} />
      {invoices.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="e-invoice">{t("cashbook.invoice")}</Label>
          <NativeSelect id="e-invoice" name="document_id" defaultValue="" className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {invoices.map((i) => (
              <NativeSelectOption key={i.id} value={i.id}>
                {[i.number, i.recipient_name, t.money(i.gross_total)].filter(Boolean).join(" · ")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("cashbook.invoiceHint")}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("cashbook.bookHint")}</p>
      <SubmitButton className="justify-self-start">{t("cashbook.book")}</SubmitButton>
    </form>
  )
}

function AccountForm({ t, a, today }: { t: T; a?: Tables<"cash_accounts">; today: string }) {
  return (
    <form action={saveAccount} className="grid gap-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Field id="a-name" name="name" label={t("cashbook.accountName")} defaultValue={a?.name ?? ""} placeholder={t("cashbook.accountPlaceholder")} maxLength={100} required />
      <div className="grid gap-2">
        <Label htmlFor="a-kind">{t("cashbook.accountKind")}</Label>
        <NativeSelect id="a-kind" name="kind" defaultValue={a?.kind ?? "cash"} className="w-full">
          {ACCOUNT_KINDS.map((k) => (
            <NativeSelectOption key={k} value={k}>
              {t.dynamic(`cashbook.kinds.${k}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="a-opening" name="opening" label={t("cashbook.opening")} inputMode="decimal" defaultValue={a ? (a.opening_cents / 100).toFixed(2).replace(".", ",") : ""} placeholder="0,00" />
        <Field id="a-on" name="opening_on" type="date" label={t("cashbook.openingOn")} defaultValue={a?.opening_on ?? today} />
      </div>
      {a && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={a.active} className="size-4" />
          {t("cashbook.accountActive")}
        </label>
      )}
      <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
    </form>
  )
}

async function EntryDrawer({ t, ctx, e, reversedBy, canManage, sp }: { t: T; ctx: Ctx; e: Entry; reversedBy?: string | null; canManage: boolean; sp: SearchParams }) {
  const [{ data: original }, { data: doc }, { data: later }] = await Promise.all([
    e.reverses_id ? ctx.supabase.from("cash_entries").select("number").eq("id", e.reverses_id).maybeSingle() : Promise.resolve({ data: null }),
    e.document_id ? ctx.supabase.from("documents").select("id, number").eq("id", e.document_id).maybeSingle() : Promise.resolve({ data: null }),
    reversedBy === undefined ? ctx.supabase.from("cash_entries").select("number").eq("reverses_id", e.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const reversal = reversedBy ?? later?.number
  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  )
  return (
    <UrlSheet params={["edit"]} title={e.description} description={`${e.number} · ${t.money(e.amount_cents)}`}>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {row(t("cashbook.date"), t.date(e.booked_on, { dateStyle: "medium" }))}
        {row(t("cashbook.amount"), <span className={e.amount_cents < 0 ? "text-destructive tabular-nums" : "tabular-nums"}>{t.money(e.amount_cents)}</span>)}
        {e.category && row(t("cashbook.category"), e.category)}
        {e.sphere && row(t("cashbook.sphere"), t.dynamic(`cashbook.spheres.${e.sphere}`))}
        {e.counterparty && row(t("cashbook.counterparty"), e.counterparty)}
        {doc && row(t("cashbook.invoice"), <Link href={`/invoices/${doc.id}`} className="underline underline-offset-4">{doc.number}</Link>)}
        {original && row(t("cashbook.reverses"), original.number)}
        {reversal && row(t("cashbook.reversedBy"), reversal)}
        {row(t("cashbook.bookedAt"), t.date(e.created_at, { dateStyle: "medium", timeStyle: "short" }))}
      </dl>
      <section className="grid gap-2" aria-labelledby="receipts">
        <h3 id="receipts" className="font-medium">
          {t("cashbook.receipts")}
        </h3>
        <FileList ctx={ctx} entity="cash_entries" entityId={e.id} back={`/cashbook${withParams(sp, {})}`} />
      </section>
      {canManage && !e.reverses_id && !reversal && (
        <form action={reverseCashEntry} className="grid gap-2">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="account_id" value={e.account_id} />
          <p className="text-xs text-muted-foreground">{t("cashbook.reverseHint")}</p>
          <SubmitButton size="sm" variant="outline" className="justify-self-start">
            {t("cashbook.reverse")}
          </SubmitButton>
        </form>
      )}
    </UrlSheet>
  )
}

export const instant = false
