import Link from "next/link"
import { FolderIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { Page, PageHeader } from "@/components/page"
import { DownloadIcon, ExternalLinkIcon, FileIcon } from "lucide-react"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FileUpload } from "@/components/file-upload"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { fileSize } from "@/lib/files"
import { pageParam, param, withParams } from "@/lib/url"
import { restoreFile, trashFile, updateFile } from "./actions"

// Records a file can be attached to → where that record opens.
const RECORD_LINKS: Record<string, (id: string) => string> = {
  contacts: (id) => `/contacts/${id}`,
}

export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const ctx = await requirePerm("org.files.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("org.files.manage")
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const folder = param(sp, "folder")
  const trash = canManage && param(sp, "trash") === "1"
  const page = pageParam(sp)
  const editId = param(sp, "edit")

  let query = ctx.supabase
    .from("files")
    .select("id, name, size, mime, folder, entity, entity_id, created_at, deleted_at")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null).order("created_at", { ascending: false })
  if (q) query = query.ilike("name", `%${q}%`)
  if (folder && !trash) query = query.eq("folder", folder)
  const [{ data }, { data: folderRows }, { data: editing }] = await Promise.all([
    query,
    // ponytail: folder chips from the first 2000 files; a distinct RPC once orgs have more.
    ctx.supabase.from("files").select("folder").eq("org_id", ctx.org.id).is("deleted_at", null).not("folder", "is", null).limit(2000),
    editId ? ctx.supabase.from("files").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const folders = [...new Set(folderRows?.map((r) => r.folder!))].sort((a, b) => a.localeCompare(b, t.locale))
  const attached = (entity: string | null) => (entity ? (t.has(`files.entities.${entity}`) ? t.dynamic(`files.entities.${entity}`) : entity) : "")

  return (
    <Page>
      <PageHeader
        icon={FolderIcon}
        title={trash ? `${t("files.title")} · ${t("files.trash")}` : t("files.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/files" : "/files?trash=1"} icon={trash ? FolderIcon : Trash2Icon}>
                {trash ? t("files.all") : t("files.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash && <FileUpload orgId={ctx.org.id} folder={folder} />}
      />
      <Notice error={!editId ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} />
        {!trash && folders.length > 0 && <FilterMenu param="folder" label={t("files.folder")} allLabel={t("files.all")} options={folders.map((f) => ({ value: f, label: f }))} />}
      </div>
      {trash && <p className="text-sm text-muted-foreground">{t("files.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id })}
        empty={trash ? t("files.emptyTrash") : q || folder ? t("files.noMatch") : t("files.empty")}
        columns={[
          {
            header: t("files.name"),
            cell: (r) => (
              <span className="flex min-w-0 items-center gap-2">
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{r.name}</span>
              </span>
            ),
          },
          { header: t("files.folder"), cell: (r) => r.folder ?? attached(r.entity) },
          { header: t("files.size"), cell: (r) => fileSize(r.size, t.locale), className: "whitespace-nowrap" },
          { header: t("files.added"), cell: (r) => t.date(r.created_at), className: "whitespace-nowrap" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {editing && (
        <UrlSheet params={["edit"]} title={editing.name} description={`${fileSize(editing.size, t.locale)} · ${t.date(editing.created_at)}`}>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          <div className="flex flex-wrap gap-2">
            <Button render={<a href={`/files/${editing.id}`} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
              <ExternalLinkIcon /> {t("files.open")}
            </Button>
            <Button render={<a href={`/files/${editing.id}?download=1`} />} nativeButton={false} size="sm" variant="outline">
              <DownloadIcon /> {t("files.download")}
            </Button>
            {editing.entity && editing.entity_id && RECORD_LINKS[editing.entity] && (
              <Button render={<Link href={RECORD_LINKS[editing.entity](editing.entity_id)} />} nativeButton={false} size="sm" variant="outline">
                {t("files.openRecord", { record: attached(editing.entity) })}
              </Button>
            )}
          </div>
          {editing.deleted_at ? (
            canManage && (
              <form action={restoreFile}>
                <input type="hidden" name="id" value={editing.id} />
                <SubmitButton>{t("files.restore")}</SubmitButton>
              </form>
            )
          ) : (
            <form action={updateFile} className="grid gap-4">
              <input type="hidden" name="id" value={editing.id} />
              <fieldset disabled={!canManage} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="f-name">{t("files.name")}</Label>
                  <Input id="f-name" name="name" required maxLength={255} defaultValue={editing.name} />
                </div>
                {!editing.entity && (
                  <div className="grid gap-2">
                    <Label htmlFor="f-folder">{t("files.folder")}</Label>
                    <Input id="f-folder" name="folder" maxLength={200} defaultValue={editing.folder ?? ""} list="f-folders" />
                    <datalist id="f-folders">
                      {folders.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </div>
                )}
              </fieldset>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>{t("files.save")}</SubmitButton>
                  <SubmitButton formAction={trashFile} variant="outline">
                    {t("files.remove")}
                  </SubmitButton>
                </div>
              )}
            </form>
          )}
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
