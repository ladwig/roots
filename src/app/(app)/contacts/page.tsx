import Link from "next/link"
import { ContactImportBody } from "./import/body"
import { UrlSheet } from "@/components/url-sheet"
import { notFound, redirect } from "next/navigation"
import { UploadIcon } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { contactName } from "./fields"

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const ctx = await requirePerm("crm.view")
  if (!ctx.modules.has("crm")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("crm.manage")
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const tag = param(sp, "tag")
  const trash = canManage && param(sp, "trash") === "1"
  const page = pageParam(sp)
  // Old drawer links (?edit=<id>) → the contact's page.
  const editId = param(sp, "edit")
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) redirect(`/contacts/${editId}`)
  if (param(sp, "new")) redirect("/contacts/new") // old drawer link

  // All filtering happens here in the query; the UI only writes the URL.
  let query = ctx.supabase
    .from("contacts")
    .select("id, first_name, last_name, company, email, phone, city, tags, deleted_at")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  query = trash
    ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
    : query.is("deleted_at", null).order("last_name", { nullsFirst: false }).order("first_name").order("company")
  if (q) query = query.or(["first_name", "last_name", "company", "email", "phone", "city"].map((c) => `${c}.ilike.%${q}%`).join(","))
  if (tag) query = query.contains("tags", [tag])
  const [{ data }, { data: tagRows }] = await Promise.all([query, ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id })])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const tags = ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale))
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
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("contacts.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <ExportMenu entity="contacts" query={{ q, tag }} />
          {canManage && (
            <>
              <Button render={<Link href={withParams(sp, { import: "1" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                <UploadIcon /> {t("contacts.import")}
              </Button>
              <Button render={<Link href="/contacts/new" />} nativeButton={false} size="sm">
                {t("contacts.new")}
              </Button>
            </>
          )}
        </div>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} />
        <nav aria-label={t("contacts.tags")} className="flex flex-wrap gap-1.5">
          {chip(withParams(sp, { tag: undefined, trash: undefined, page: undefined }), !trash && !tag, t("contacts.all"))}
          {!trash && tags.map((tg) => chip(withParams(sp, { tag: tg, page: undefined }), tg === tag, tg))}
          {canManage && chip(withParams(sp, { trash: "1", tag: undefined, page: undefined }), trash, t("contacts.trash"))}
        </nav>
      </div>
      {trash && <p className="text-sm text-muted-foreground">{t("contacts.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/contacts/${r.id}`}
        empty={trash ? t("contacts.emptyTrash") : q || tag ? t("contacts.noMatch") : t("contacts.empty")}
        columns={[
          {
            header: t("contacts.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{contactName(r)}</span>
                {r.company && contactName(r) !== r.company && <span className="text-xs text-muted-foreground">{r.company}</span>}
              </span>
            ),
          },
          { header: t("contacts.email"), cell: (r) => <span className="break-all">{r.email}</span> },
          { header: t("contacts.phone"), cell: (r) => r.phone, className: "whitespace-nowrap" },
          { header: t("contacts.city"), cell: (r) => r.city },
          {
            header: t("contacts.tags"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.tags.map((tg) => (
                  <Badge key={tg} variant="secondary">
                    {tg}
                  </Badge>
                ))}
              </span>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {canManage && param(sp, "import") === "1" && (
        <UrlSheet params={["import"]} title={t("contacts.importTitle")} wide>
          <ContactImportBody ctx={ctx} />
        </UrlSheet>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
