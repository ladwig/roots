import Link from "next/link"
import { FormCard, Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { PRESETS, period } from "@/reports/period"
import { loadReport } from "@/reports/server"
import { GroupedBars, StackedBars } from "./charts"

// Reports: KPIs per area for a period (presets or own range, in the URL). Each area only for those who may see it.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePerm("reports.view")
  if (!ctx.modules.has("reports")) notFound()
  const t = await getT()
  const sp = await searchParams
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const p = period(today, param(sp, "p"), param(sp, "from"), param(sp, "to"))
  const r = await loadReport(ctx.supabase, ctx.org.id, p.from, p.to)
  const day = (d: string) => t.date(d, { dateStyle: "medium" })
  const num = (n: number) => t.number(n)
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "–")
  const e = r.events
  const admitted = e ? e.tickets_in + e.members_in + e.guests_in : 0

  return (
    <Page>
      <PageHeader area="reports" title={t("reports.title")} meta={t("reports.range", { from: day(p.from), to: day(p.to) })} />
      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label={t("reports.period")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PRESETS.map((k) => (
            <Link
              key={k}
              href={`/reports?p=${k}`}
              aria-current={p.preset === k ? "true" : undefined}
              className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
            >
              {t.dynamic(`reports.presets.${k}`)}
            </Link>
          ))}
        </nav>
        <form key={`${p.from}:${p.to}`} className="flex flex-wrap items-end gap-3" action="/reports">
          <div className="grid gap-1">
            <Label htmlFor="r-from">{t("reports.from")}</Label>
            <Input id="r-from" name="from" type="date" defaultValue={p.from} className="w-40" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="r-to">{t("reports.to")}</Label>
            <Input id="r-to" name="to" type="date" defaultValue={p.to} className="w-40" />
          </div>
          <SubmitButton size="sm" variant="outline">
            {t("reports.show")}
          </SubmitButton>
        </form>
      </div>

      {r.members && (
        <Section id="members" title={t("reports.members.title")}>
          <Tiles>
            <Kpi label={t("reports.members.active")} value={num(r.members.active)} hint={t("reports.today")} />
            <Kpi label={t("reports.members.joined")} value={num(r.members.joined)} />
            <Kpi label={t("reports.members.left")} value={num(r.members.left)} />
            <Kpi label={t("reports.members.paused")} value={num(r.members.paused)} hint={t("reports.today")} />
            <Kpi label={t("reports.members.feeFree")} value={num(r.members.fee_free)} hint={t("reports.today")} />
            <Kpi label={t("reports.members.duesPaid")} value={t.money(r.members.dues_paid_cents)} />
            <Kpi label={t("reports.members.duesOpen")} value={t.money(r.members.dues_open_cents)} hint={t("reports.today")} />
            <Kpi
              label={t("reports.members.duesOverdue")}
              value={t.money(r.members.dues_overdue_cents)}
              hint={t("reports.members.overduePeople", { count: r.members.dues_overdue_people })}
              warn={r.members.dues_overdue_cents > 0}
            />
          </Tiles>
          <div className="grid gap-6 md:grid-cols-2">
            <Bars title={t("reports.members.byType")} rows={r.members.by_type.map((x) => ({ label: x.type, value: x.active }))} t={t} />
            {r.members.months.length > 1 && (
              <div className="grid content-start gap-2">
                <h3 className="text-sm text-muted-foreground">{t("reports.members.perMonth")}</h3>
                <GroupedBars
                  data={r.members.months.map((m) => ({ label: t.date(`${m.month}-01`, { month: "short", year: "2-digit" }), joined: m.joined, left: m.left }))}
                  series={[
                    { key: "joined", label: t("reports.members.joined") },
                    { key: "left", label: t("reports.members.left") },
                  ]}
                />
              </div>
            )}
          </div>
        </Section>
      )}

      {e && (
        <Section id="events" title={t("reports.events.title")}>
          <Tiles>
            <Kpi label={t("reports.events.count")} value={num(e.count)} />
            {e.tickets && <Kpi label={t("reports.events.sold")} value={num(e.sold)} />}
            {e.tickets && <Kpi label={t("reports.events.revenue")} value={t.money(e.revenue_cents)} />}
            <Kpi label={t("reports.events.admitted")} value={num(admitted)} />
            {e.tickets && <Kpi label={t("reports.events.ticketsIn")} value={num(e.tickets_in)} />}
            {e.tickets && <Kpi label={t("reports.events.membersIn")} value={num(e.members_in)} />}
            {e.guests && <Kpi label={t("reports.events.guestsIn")} value={num(e.guests_in)} />}
          </Tiles>
          {Object.keys(e.members_by_type).length > 0 && (
            <Bars title={t("reports.events.membersByType")} rows={Object.entries(e.members_by_type).map(([label, value]) => ({ label, value }))} t={t} />
          )}
          {e.list.length > 1 && (
            <div className="grid gap-2">
              <h3 className="text-sm text-muted-foreground">{t("reports.events.perEvent")}</h3>
              <StackedBars
                data={[...e.list].reverse().map((x) => ({ label: t.date(x.starts_at, { day: "2-digit", month: "2-digit" }), tickets: x.tickets_in, members: x.members_in, guests: x.guests_in }))}
                series={[
                  ...(e.tickets ? [{ key: "tickets", label: t("reports.events.ticketsIn") }, { key: "members", label: t("reports.events.membersIn") }] : []),
                  ...(e.guests ? [{ key: "guests", label: t("reports.events.guestsIn") }] : []),
                ]}
              />
            </div>
          )}
          <DataTable
            rows={e.list}
            rowKey={(x) => x.id}
            empty={t("reports.events.none")}
            columns={[
              {
                header: t("reports.events.event"),
                cell: (x) => (
                  <Link href={`/events/${x.id}`} className="grid underline-offset-4 hover:underline">
                    <span className="font-medium">{x.title}</span>
                    <span className="text-xs text-muted-foreground">{t.date(x.starts_at, { dateStyle: "medium" })}</span>
                  </Link>
                ),
              },
              ...(e.tickets
                ? [
                    { header: t("reports.events.sold"), cell: (x: (typeof e.list)[number]) => num(x.sold) },
                    { header: t("reports.events.revenue"), cell: (x: (typeof e.list)[number]) => t.money(x.revenue_cents) },
                    { header: t("reports.events.ticketsIn"), cell: (x: (typeof e.list)[number]) => num(x.tickets_in) },
                    {
                      header: t("reports.events.membersIn"),
                      cell: (x: (typeof e.list)[number]) => (
                        <span title={Object.entries(x.members_by_type).map(([k, v]) => `${k}: ${v}`).join(", ")}>{num(x.members_in)}</span>
                      ),
                    },
                  ]
                : []),
              ...(e.guests ? [{ header: t("reports.events.guestsIn"), cell: (x: (typeof e.list)[number]) => num(x.guests_in) }] : []),
              {
                header: t("reports.events.occupancy"),
                cell: (x) => (x.capacity ? pct(x.tickets_in + x.members_in + x.guests_in, x.capacity) : "–"),
              },
            ]}
          />
        </Section>
      )}

      {r.payments && (
        <Section id="payments" title={t("reports.payments.title")}>
          <Tiles>
            <Kpi label={t("reports.payments.gross")} value={t.money(r.payments.gross_cents)} />
            <Kpi label={t("reports.payments.orders")} value={num(r.payments.orders)} />
            {Object.entries(r.payments.by_source).map(([k, v]) => (
              <Kpi key={k} label={t.has(`reports.sources.${k}`) ? t.dynamic(`reports.sources.${k}`) : k} value={t.money(v)} />
            ))}
          </Tiles>
        </Section>
      )}

      {r.invoices && (
        <Section id="invoices" title={t("reports.invoices.title")}>
          <Tiles>
            <Kpi label={t("reports.invoices.issued")} value={t.money(r.invoices.issued_cents)} hint={t("reports.invoices.count", { count: r.invoices.issued })} />
            <Kpi label={t("reports.invoices.paid")} value={t.money(r.invoices.paid_cents)} />
            <Kpi label={t("reports.invoices.open")} value={t.money(r.invoices.open_cents)} hint={t("reports.today")} />
            <Kpi label={t("reports.invoices.overdue")} value={t.money(r.invoices.overdue_cents)} hint={t("reports.today")} warn={r.invoices.overdue_cents > 0} />
          </Tiles>
        </Section>
      )}

      {r.cashbook && (
        <Section id="cashbook" title={t("reports.cashbook.title")}>
          <Tiles>
            <Kpi label={t("reports.cashbook.income")} value={t.money(r.cashbook.income_cents)} />
            <Kpi label={t("reports.cashbook.expenses")} value={t.money(r.cashbook.expense_cents)} />
            <Kpi label={t("reports.cashbook.result")} value={t.money(r.cashbook.income_cents - r.cashbook.expense_cents)} warn={r.cashbook.income_cents < r.cashbook.expense_cents} />
            {r.cashbook.accounts.map((a) => (
              <Kpi key={a.name} label={a.name} value={t.money(a.balance_cents)} hint={t("reports.cashbook.balances")} />
            ))}
          </Tiles>
          {Object.keys(r.cashbook.by_sphere).length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm text-muted-foreground">{t("reports.cashbook.bySphere")}</h3>
              <GroupedBars
                data={Object.entries(r.cashbook.by_sphere).map(([k, v]) => ({
                  label: k === "–" ? t("reports.cashbook.noSphere") : t.dynamic(`cashbook.spheres.${k}`),
                  income: v.income_cents / 100,
                  expenses: v.expense_cents / 100,
                }))}
                series={[
                  { key: "income", label: t("reports.cashbook.income") },
                  { key: "expenses", label: t("reports.cashbook.expenses") },
                ]}
              />
            </div>
          )}
        </Section>
      )}

      {r.shifts && (
        <Section id="shifts" title={t("reports.shifts.title")}>
          <Tiles>
            <Kpi label={t("reports.shifts.count")} value={num(r.shifts.count)} />
            <Kpi label={t("reports.shifts.filled")} value={pct(r.shifts.assigned, r.shifts.needed)} hint={t("reports.shifts.slots", { assigned: r.shifts.assigned, needed: r.shifts.needed })} />
            <Kpi label={t("reports.shifts.hours")} value={t.number(r.shifts.worked_minutes / 60, { maximumFractionDigits: 1 })} />
          </Tiles>
        </Section>
      )}

      {(r.contacts || r.forms || r.courses || r.email) && (
        <Section id="more" title={t("reports.more")}>
          <Tiles>
            {r.contacts && <Kpi label={t("reports.contacts.new")} value={num(r.contacts.new)} hint={t("reports.contacts.total", { count: r.contacts.total })} />}
            {r.forms && <Kpi label={t("reports.forms.submissions")} value={num(r.forms.submissions)} />}
            {r.courses && <Kpi label={t("reports.courses.enrolled")} value={num(r.courses.enrolled)} hint={t("reports.courses.waiting", { count: r.courses.waiting })} />}
            {r.email && <Kpi label={t("reports.email.sent")} value={num(r.email.sent)} hint={t("reports.email.delivered", { rate: pct(r.email.delivered, r.email.sent) })} />}
            {r.email && r.email.bounced + r.email.complained > 0 && <Kpi label={t("reports.email.bounced")} value={num(r.email.bounced + r.email.complained)} warn />}
          </Tiles>
        </Section>
      )}
    </Page>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <FormCard id={id} title={title}>
      {children}
    </FormCard>
  )
}

const Tiles = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="grid content-start gap-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={warn ? "text-xl font-semibold text-destructive tabular-nums" : "text-xl font-semibold tabular-nums"}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

// Horizontal bars, relative to the largest value. ponytail: CSS bars; a chart library when someone needs axes.
function Bars({ title, rows, t }: { title: string; rows: { label: string; value: number; extra?: string }[]; t: T }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="grid content-start gap-2">
      <h3 className="text-sm text-muted-foreground">{title}</h3>
      {rows.length ? (
        <ul className="grid gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="h-2 rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
              <span className="tabular-nums">
                {t.number(r.value)}
                {r.extra && <span className="ml-1 text-muted-foreground">{r.extra}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">–</p>
      )}
    </div>
  )
}

export const instant = false
