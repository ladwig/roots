import Link from "next/link"
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
  contacts: (id) => `/contacts?edit=${id}`,
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
  const attached = (entity: string | null) => (entity ? (t.has(`files.entities.${entity}`) ? t.dynamic(`files.entities.${entity}`) : entity) : "")

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("files.title")}</h1>
        {canManage && !trash && <FileUpload orgId={ctx.org.id} folder={folder} />}
      </div>
      <Notice error={!editId ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} />
        <nav aria-label={t("files.folder")} className="flex flex-wrap gap-1.5">
          {chip(withParams(sp, { folder: undefined, trash: undefined, page: undefined, edit: undefined }), !trash && !folder, t("files.all"))}
          {!trash && folders.map((f) => chip(withParams(sp, { folder: f, page: undefined, edit: undefined }), f === folder, f))}
          {canManage && chip(withParams(sp, { trash: "1", folder: undefined, page: undefined, edit: undefined }), trash, t("files.trash"))}
        </nav>
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
    </div>
  )
}

export const instant = false
