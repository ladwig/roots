import { DownloadIcon, FileIcon, Trash2Icon } from "lucide-react"
import { trashFile } from "@/app/(app)/files/actions"
import { FileUpload } from "@/components/file-upload"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { fileSize } from "@/lib/files"

/** Files attached to one record, with upload + remove. Drop into any record's drawer or page. */
export async function FileList({ ctx, entity, entityId, back }: { ctx: Awaited<ReturnType<typeof getContext>>; entity: string; entityId: string; back: string }) {
  if (!ctx.can("org.files.view")) return null
  const t = await getT()
  const canManage = ctx.can("org.files.manage")
  const { data: files } = await ctx.supabase
    .from("files")
    .select("id, name, size, created_at")
    .eq("org_id", ctx.org.id)
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  return (
    <section className="grid gap-3" aria-labelledby={`files-${entityId}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`files-${entityId}`} className="font-medium">
          {t("files.title")}
        </h3>
        {canManage && <FileUpload orgId={ctx.org.id} entity={entity} entityId={entityId} />}
      </div>
      {files?.length ? (
        <ul className="grid gap-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                {f.name}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{fileSize(f.size, t.locale)}</span>
              <Tooltip>
                <TooltipTrigger render={<Button render={<a href={`/files/${f.id}?download=1`} />} nativeButton={false} size="icon-sm" variant="ghost" aria-label={t("files.download")} />}>
                  <DownloadIcon />
                </TooltipTrigger>
                <TooltipContent>{t("files.download")}</TooltipContent>
              </Tooltip>
              {canManage && (
                <form action={trashFile}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="back" value={back} />
                  <Tooltip>
                    <TooltipTrigger render={<SubmitButton size="icon-sm" variant="ghost" aria-label={t("files.remove")} />}>
                      <Trash2Icon />
                    </TooltipTrigger>
                    <TooltipContent>{t("files.remove")}</TooltipContent>
                  </Tooltip>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("files.none")}</p>
      )}
    </section>
  )
}
