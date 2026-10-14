import Link from "next/link"
import { BellIcon, DownloadIcon, LandmarkIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import { ActionsMenu, MenuExport } from "@/components/actions-menu"
import { PageHeader } from "@/components/page"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { addLevy, createSepaRun, generateDues, sendReminders, setRunStatus } from "../actions"

type Status = "open" | "paid" | "cancelled"
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10)

export default async function DuesPage({ searchParams }: PageProps<"/members/dues">) {
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("members.manage")
  const status = (["open", "paid", "cancelled", "all"] as const).find((s) => s === param(sp, "status")) ?? "open"
  const page = pageParam(sp)
  const now = today()
  const year = now.slice(0, 4)

  let query = ctx.supabase
    .from("member_dues")
    .select("id, membership_id, description, amount_cents, due_on, status, run_id, reminders, reminded_at, memberships(number, contacts(first_name, last_name, company, email))")
    .eq("org_id", ctx.org.id)
    .order("due_on", { ascending: false })
    .range(...pageRange(page))
  if (status !== "all") query = query.eq("status", status)
  const [{ data }, { data: runs }, { data: open }, { data: tagRows }] = await Promise.all([
    query,
    ctx.supabase.from("sepa_runs").select("id, collection_on, count, total_cents, status, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(10),
    // ponytail: open total summed here over ≤ 5000 rows; an RPC once dues lists get longer.
    ctx.supabase.from("member_dues").select("amount_cents, due_on").eq("org_id", ctx.org.id).eq("status", "open").limit(5000),
    canManage ? ctx.supabase.from("contacts").select("tags").eq("org_id", ctx.org.id).is("deleted_at", null).limit(2000) : Promise.resolve({ data: [] }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const openTotal = (open ?? []).reduce((s, d) => s + d.amount_cents, 0)
  const overdue = (open ?? []).filter((d) => d.due_on < now).reduce((s, d) => s + d.amount_cents, 0)
  const tags = [...new Set((tagRows ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, t.locale))
  const highlight = param(sp, "run")
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

  return (
    <>
      <PageHeader
        title={t("membership.tabs.dues")}
        area="members"
        meta={t("membership.openSummary", { open: t.money(openTotal), overdue: t.money(overdue) })}
        actions={
          canManage && (
            <>
              {overdue > 0 && (
                <form action={sendReminders}>
                  <SubmitButton size="sm" variant="outline">
                    <BellIcon /> {t("membership.remindAll")}
                  </SubmitButton>
                </form>
              )}
              <Button render={<Link href={withParams(sp, { new: "levy" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                <PlusIcon /> {t("membership.levy")}
              </Button>
              <Button render={<Link href={withParams(sp, { new: "sepa" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                <LandmarkIcon /> {t("membership.sepa")}
              </Button>
            </>
          )
        }
        menu={
          <ActionsMenu>
            <MenuExport entity="dues" query={{ status }} />
          </ActionsMenu>
        }
        primary={canManage ? { href: withParams(sp, { new: "generate" }), label: t("membership.generate"), icon: RefreshCwIcon } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {canManage && param(sp, "new") === "generate" && (
        <UrlSheet params={["new"]} title={t("membership.generate")}>
          <form action={generateDues} className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("membership.generateHint")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field id="g-from" name="from" type="date" label={t("membership.from")} defaultValue={`${year}-01-01`} required />
              <Field id="g-to" name="to" type="date" label={t("membership.to")} defaultValue={`${year}-12-31`} required />
            </div>
            <SubmitButton className="justify-self-end">
              {t("membership.generate")}
            </SubmitButton>
          </form>
        </UrlSheet>
      )}
      {canManage && param(sp, "new") === "levy" && (
        <UrlSheet params={["new"]} title={t("membership.levy")}>
          <form action={addLevy} className="grid gap-4">
            <Field id="l-desc" name="description" label={t("membership.levyText")} maxLength={140} required placeholder={t("membership.levyPlaceholder")} />
            <div className="grid grid-cols-2 gap-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="l-amount">{t("membership.amount")}</Label>
                <TypedInput kind="money" id="l-amount" name="amount" required />
              </div>
              <Field id="l-due" name="due_on" type="date" label={t("membership.dueOn")} defaultValue={now} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="l-tag">{t("membership.levyGroup")}</Label>
              <NativeSelect id="l-tag" name="tag" defaultValue="" className="w-full">
                <NativeSelectOption value="">{t("membership.allMembers")}</NativeSelectOption>
                {tags.map((tg) => (
                  <NativeSelectOption key={tg} value={tg}>
                    {tg}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <SubmitButton className="justify-self-end">
              {t("membership.addLevy")}
            </SubmitButton>
          </form>
        </UrlSheet>
      )}
      {canManage && param(sp, "new") === "sepa" && (
        <UrlSheet params={["new"]} title={t("membership.sepa")}>
          <form action={createSepaRun} className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("membership.sepaHint")}</p>
            <Field id="s-date" name="collection_on" type="date" label={t("membership.collectionOn")} defaultValue={addDays(now, 7)} min={addDays(now, 1)} required />
            <SubmitButton className="justify-self-end">
              {t("membership.createRun")}
            </SubmitButton>
          </form>
        </UrlSheet>
      )}

      {!!runs?.length && (
        <section className="grid gap-2" aria-labelledby="runs">
          <h2 id="runs" className="font-medium">
            {t("membership.runs")}
          </h2>
          <ul className="grid gap-2">
            {runs.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${r.id === highlight ? "border-primary" : ""}`}>
                <span className="min-w-0 flex-1">
                  {t("membership.runLine", { date: t.date(r.collection_on), count: r.count, total: t.money(r.total_cents) })}
                </span>
                <Badge variant={r.status === "collected" ? "default" : r.status === "exported" ? "secondary" : "outline"}>
                  {t(`membership.runStatus.${r.status as "exported" | "collected" | "cancelled"}`)}
                </Badge>
                {r.status !== "cancelled" && (
                  <Button render={<a href={`/members/sepa/${r.id}`} />} nativeButton={false} size="sm" variant="outline">
                    <DownloadIcon /> {t("membership.downloadXml")}
                  </Button>
                )}
                {canManage && r.status === "exported" && (
                  <>
                    <form action={setRunStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="collected" />
                      <SubmitButton size="sm">{t("membership.markCollected")}</SubmitButton>
                    </form>
                    <form action={setRunStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <SubmitButton size="sm" variant="ghost">
                        {t("membership.cancelRun")}
                      </SubmitButton>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label={t("membership.status")} className="flex flex-wrap gap-1.5">
        {(["open", "paid", "cancelled", "all"] as const).map((s) =>
          chip(withParams(sp, { status: s === "open" ? undefined : s, page: undefined, run: undefined }), s === status, s === "all" ? t("membership.filters.all") : t(`membership.dueStatus.${s}`)),
        )}
      </nav>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/members/${r.membership_id}`}
        empty={t("membership.noDues")}
        columns={[
          {
            header: t("membership.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.memberships?.contacts ? contactName(r.memberships.contacts) : ""}</span>
                <span className="text-xs text-muted-foreground">{r.description}</span>
              </span>
            ),
          },
          { header: t("membership.dueOn"), cell: (r) => t.date(r.due_on), className: "whitespace-nowrap" },
          { header: t("membership.amount"), cell: (r) => t.money(r.amount_cents), className: "whitespace-nowrap tabular-nums" },
          {
            header: t("membership.status"),
            cell: (r) => (
              <Badge variant={r.status === "paid" ? "default" : r.status === "open" ? (r.due_on < now ? "destructive" : "secondary") : "outline"}>
                {r.status === "open" && r.due_on < now ? t("membership.overdue") : t(`membership.dueStatus.${r.status as Status}`)}
                {r.status === "open" && r.run_id ? ` · ${t("membership.inRun")}` : ""}
                {r.status === "open" && r.reminded_at ? ` · ${t("membership.reminded", { count: r.reminders, date: t.date(r.reminded_at) })}` : ""}
              </Badge>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
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

export const instant = false
