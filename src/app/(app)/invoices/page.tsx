import Link from "next/link"
import { notFound } from "next/navigation"
import { SettingsIcon } from "lucide-react"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { createDocument } from "./actions"

const KINDS = ["invoice", "quote"] as const
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
      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )
  const newDoc = (k: (typeof KINDS)[number], label: string, variant: "default" | "outline") => (
    <form action={createDocument}>
      <input type="hidden" name="kind" value={k} />
      <SubmitButton size="sm" variant={variant}>
        {label}
      </SubmitButton>
    </form>
  )

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("invoices.title")}</h1>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button render={<Link href="/invoices/settings" />} nativeButton={false} size="sm" variant="ghost">
              <SettingsIcon /> {t("invoices.settings")}
            </Button>
          )}
          {canManage && newDoc("quote", t("invoices.newQuote"), "outline")}
          {canManage && newDoc("invoice", t("invoices.newInvoice"), "default")}
        </div>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("invoices.search")} />
        <nav aria-label={t("invoices.kind")} className="flex flex-wrap gap-1.5">
          {[undefined, ...KINDS].map((k) => chip(withParams(sp, { kind: k, page: undefined }), k === kind, k ? t.dynamic(`invoices.kinds.${k}`) : t("invoices.all")))}
        </nav>
        <nav aria-label={t("invoices.status")} className="flex flex-wrap gap-1.5">
          {[undefined, "draft", "sent", "overdue", "paid", "accepted", "cancelled"].map((s) =>
            chip(withParams(sp, { status: s, page: undefined }), s === param(sp, "status"), s ? t.dynamic(`invoices.filters.${s}`) : t("invoices.allStatus")),
          )}
        </nav>
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
    </div>
  )
}

export const instant = false
