"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { readContact } from "./fields"

const PATH = "/contacts"

async function manager() {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  if (!ctx.modules.has("crm")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

// Record id comes in as a hidden field (works without JS and is callable by plain form posts).
const idOf = (fd: FormData) => String(fd.get("id") ?? "")
const uniqueError = (t: Awaited<ReturnType<typeof getT>>, error: { code?: string; message: string }) =>
  error.code === "23505" ? t("errors.email_taken") : dbError(t, error)

export async function createContact(fd: FormData) {
  const { ctx, t } = await manager()
  const r = readContact(fd)
  if ("error" in r) back(`${PATH}?new=contact`, { error: t.dynamic(r.error) })
  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert({ ...r.row, org_id: ctx.org.id })
    .select("id")
    .single()
  if (error) back(`${PATH}?new=contact`, { error: uniqueError(t, error) })
  deliverSoon()
  back(`${PATH}?edit=${data.id}`, { ok: t("contacts.created") })
}

export async function updateContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}?edit=${id}`
  const r = readContact(fd)
  if ("error" in r) back(here, { error: t.dynamic(r.error) })
  const { error, count } = await ctx.supabase.from("contacts").update(r.row, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? uniqueError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("contacts.saved") })
}

export async function trashContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.contacts", p_id: id })
  if (error) back(`${PATH}?edit=${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("contacts.trashed") })
}

export async function restoreContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.contacts", p_id: id })
  // A live contact took the email meanwhile → unique violation.
  if (error) back(`${PATH}?trash=1&edit=${id}`, { error: uniqueError(t, error) })
  back(`${PATH}?edit=${id}`, { ok: t("contacts.restored") })
}

export async function addNote(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}?edit=${id}`
  const body = String(fd.get("body") ?? "").trim()
  if (!body || body.length > 10000) back(here, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("contact_notes").insert({ org_id: ctx.org.id, contact_id: id, body })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("contacts.noteAdded") })
}

export async function deleteNote(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}?edit=${idOf(fd)}`
  const { error, count } = await ctx.supabase
    .from("contact_notes")
    .delete({ count: "exact" })
    .eq("id", String(fd.get("note") ?? ""))
    .eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("contacts.noteDeleted") })
}
