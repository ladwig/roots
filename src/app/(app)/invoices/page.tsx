import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { FilterMenu } from "@/components/filter-menu"
import { Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { createDocument } from "./actions"

const KINDS = ["invoice", "quote", "cancellation"] as const
const STATUSES = ["draft", "sent", "paid", "accepted", "declined", "cancelled"] as const

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const ctx = await requirePerm("invoices.view")
  if (!ctx.modules.has("invoices")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("invoices.manage")
  const kind = KINDS.find((k) => k === param(sp, "kind"))
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const overdue = param(sp, "status") === "overdue"
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const page = pageParam(sp)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

  let query = ctx.supabase
    .from("documents")
    .select("id, kind, status, number, recipient_name, issue_date, due_date, gross_total, currency, created_at")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (kind) query = query.eq("kind", kind)
  if (status) query = query.eq("status", status)
  if (overdue) query = query.eq("kind", "invoice").eq("status", "sent").lt("due_date", today)
  if (q) query = query.or(`number.ilike.%${q}%,recipient_name.ilike.%${q}%`)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const chip = (href: string, current: boolean, label: string) => (
    <Link
      key={label}
      href={href}
      aria-current={current ? "true" : undefined}
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
    >
      {label}
    </Link>
  )
  const newDoc = (k: (typeof KINDS)[number], label: string, variant: "default" | "outline") => (
    <form action={createDocument}>
      <input type="hidden" name="kind" value={k} />
      <SubmitButton size="sm" variant={variant} data-shortcut={variant === "default" ? "new" : undefined}>
        <PlusIcon /> {label}
      </SubmitButton>
    </form>
  )

  return (
    <Page>
      <PageHeader
        area="finance"
        title={t("invoices.title")}
        settings={canManage && { href: "/invoices/settings", label: t("common.settings") }}
        actions={canManage && newDoc("quote", t("invoices.newQuote"), "outline")}
        primary={canManage && newDoc("invoice", t("invoices.newInvoice"), "default")}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={q} label={t("invoices.search")} />
        <nav aria-label={t("invoices.kind")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {[undefined, ...KINDS].map((k) => chip(withParams(sp, { kind: k, page: undefined }), k === kind, k ? t.dynamic(`invoices.kinds.${k}`) : t("invoices.all")))}
        </nav>
        <FilterMenu param="status" label={t("invoices.status")} allLabel={t("invoices.allStatus")} options={["draft", "sent", "overdue", "paid", "accepted", "cancelled"].map((x) => ({ value: x, label: t.dynamic(`invoices.filters.${x}`) }))} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(d) => d.id}
        rowHref={(d) => `/invoices/${d.id}`}
        empty={t("invoices.empty")}
        columns={[
          {
            header: t("invoices.number"),
            cell: (d) => (
              <span className="grid">
                <span className="font-medium">{d.number ?? t("invoices.draftNumber")}</span>
                <span className="text-xs text-muted-foreground">{t.dynamic(`invoices.kinds.${d.kind}`)}</span>
              </span>
            ),
          },
          { header: t("invoices.recipient"), cell: (d) => d.recipient_name },
          { header: t("invoices.issueDate"), cell: (d) => (d.issue_date ? t.date(`${d.issue_date}T12:00:00Z`) : ""), className: "whitespace-nowrap" },
          { header: t("invoices.gross"), cell: (d) => t.money(d.gross_total, d.currency), className: "text-right tabular-nums whitespace-nowrap" },
          {
            header: t("invoices.status"),
            cell: (d) => {
              const late = d.kind === "invoice" && d.status === "sent" && d.due_date && d.due_date < today
              return (
                <Badge variant={late ? "destructive" : d.status === "paid" || d.status === "accepted" ? "default" : "outline"}>
                  {late ? t("invoices.filters.overdue") : t.dynamic(`invoices.statuses.${d.kind}.${d.status}`)}
                </Badge>
              )
            },
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false
