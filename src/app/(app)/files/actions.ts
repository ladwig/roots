"use server"

import { pickedIds, trashMany } from "@/lib/bulk"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { FILE_PATH, MAX_FILE_BYTES } from "@/lib/files"
import { back } from "@/lib/url"

const PATH = "/files"
const UUID = /^[0-9a-f-]{36}$/
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim()
// Only local paths: the form says where to go back to (the record the file list sits on).
const backTo = (fd: FormData) => {
  const p = text(fd, "back")
  return p.startsWith("/") && !p.startsWith("//") ? p : PATH
}

export type UploadedFile = { id?: string; name: string; path: string; mime: string; size: number } // id: chosen by the browser (optional)

/** Called by <FileUpload> after the browser put the objects into Storage. */
export async function registerFiles(files: UploadedFile[], target: { entity?: string; entityId?: string; folder?: string }): Promise<{ error?: string; ids?: string[] }> {
  const ctx = await getContext()
  const t = await getT()
  if (!ctx.can("org.files.manage")) return { error: t("errors.not_allowed") }
  if (target.entity && (!/^[a-z_]{1,40}$/.test(target.entity) || !UUID.test(target.entityId ?? ""))) return { error: t("errors.not_allowed") }
  const folder = target.folder?.trim().slice(0, 200) || null
  const rows = files.map((f) => ({
    ...(f.id && UUID.test(f.id) ? { id: f.id } : {}),
    org_id: ctx.org.id,
    name: String(f.name).trim().slice(0, 255) || "file",
    path: String(f.path),
    mime: String(f.mime || "application/octet-stream").slice(0, 200),
    size: Math.max(0, Math.min(Number(f.size) || 0, MAX_FILE_BYTES)),
    entity: target.entity ?? null,
    entity_id: target.entity ? target.entityId! : null,
    folder: target.entity ? null : folder,
  }))
  if (!rows.length || rows.length > 50 || rows.some((r) => !FILE_PATH.test(r.path) || !r.path.startsWith(`orgs/${ctx.org.id}/`)))
    return { error: t("errors.not_allowed") }
  const { data, error } = await ctx.supabase.from("files").insert(rows).select("id, path")
  // ids in the order of the given files (the editor links them right away)
  return error ? { error: dbError(t, error) } : { ids: rows.map((r) => ("id" in r ? (r.id as string) : (data?.find((d) => d.path === r.path)?.id ?? ""))) }
}

export async function updateFile(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const id = text(fd, "id")
  const name = text(fd, "name").slice(0, 255)
  const here = `${PATH}?edit=${id}`
  if (!name) back(here, { error: t("files.nameRequired") })
  const { error } = await ctx.supabase.from("files").update({ name, folder: text(fd, "folder").slice(0, 200) || null }).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("files.saved") })
}

export async function trashFile(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.files", p_id: text(fd, "id") })
  back(backTo(fd), error ? { error: dbError(t, error) } : { ok: t("files.trashed") })
}

export async function restoreFile(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const id = text(fd, "id")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.files", p_id: id })
  back(`${PATH}?edit=${id}`, error ? { error: dbError(t, error) } : { ok: t("files.restored") })
}

/** Bulk bar on the file list: move the ticked files to the trash. */
export async function bulkTrashFiles(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const ids = pickedIds(fd)
  const error = ids.length ? await trashMany(ctx, "public.files", ids) : null
  back(backTo(fd), error ? { error: dbError(t, error) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
}
