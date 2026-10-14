import Link from "next/link"
import { ContactImportBody } from "./import/body"
import { UrlSheet } from "@/components/url-sheet"
import { notFound, redirect } from "next/navigation"
import { PlusIcon, Trash2Icon, UploadIcon, UsersIcon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { EmptyState, Page, PageHeader } from "@/components/page"
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
  const empty = !q && !tag && !trash && page === 1 && !rows.length

  return (
    <Page>
      <PageHeader
        area="contacts"
        title={trash ? `${t("contacts.title")} · ${t("contacts.trash")}` : t("contacts.title")}
        menu={
          <ActionsMenu>
            {canManage && (
              <MenuLink href={withParams(sp, { import: "1" })} icon={<UploadIcon />}>
                {t("contacts.import")}
              </MenuLink>
            )}
            <MenuExport entity="contacts" query={{ q, tag }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/contacts" : "/contacts?trash=1"} icon={trash ? <UsersIcon /> : <Trash2Icon />}>
                  {trash ? t("contacts.all") : t("contacts.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
        primary={canManage && !trash ? { href: "/contacts/new", label: t("contacts.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {!empty && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox q={q} label={t("common.search")} />
          {!trash && tags.length > 0 && <FilterMenu param="tag" label={t("contacts.tags")} options={tags.map((tg) => ({ value: tg, label: tg }))} />}
        </div>
      )}
      {trash && <p className="text-sm text-muted-foreground">{t("contacts.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/contacts/${r.id}`}
        empty={
          trash ? (
            t("contacts.emptyTrash")
          ) : q || tag ? (
            t("contacts.noMatch")
          ) : (
            <EmptyState
              area="contacts"
              title={t("contacts.empty")}
              text={t("contacts.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/contacts/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("contacts.new")}
                  </Button>
                )
              }
            />
          )
        }
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
    </Page>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
