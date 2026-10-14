"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { back } from "@/lib/url"
import type { ImportOutcome } from "@/components/csv-import"
import { importContactRows, uniqueError } from "@/contacts/server"
import { fromForm, readContact } from "./fields"

const PATH = "/contacts"

async function manager() {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  if (!ctx.modules.has("crm")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

// Record id comes in as a hidden field (works without JS and is callable by plain form posts).
const idOf = (fd: FormData) => String(fd.get("id") ?? "")
type Ctx = Awaited<ReturnType<typeof requirePerm>>
type T = Awaited<ReturnType<typeof getT>>
const fieldError = (t: T, e: { error: string; field?: string }) => (e.field ? `${e.field}: ` : "") + t.dynamic(e.error)
const readForm = async (ctx: Ctx, fd: FormData) => readContact(fromForm(fd), await loadFields(ctx.supabase, ctx.org.id, "contacts"))

export async function createContact(fd: FormData) {
  const { ctx, t } = await manager()
  const r = await readForm(ctx, fd)
  if ("error" in r) back(`${PATH}/new`, { error: fieldError(t, r) })
  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert({ ...r.row, org_id: ctx.org.id })
    .select("id")
    .single()
  if (error) back(`${PATH}/new`, { error: uniqueError(t, error) })
  deliverSoon()
  back(`${PATH}/${data.id}`, { ok: t("contacts.created") })
}

export async function updateContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}/${id}`
  const r = await readForm(ctx, fd)
  if ("error" in r) back(here, { error: fieldError(t, r) })
  const { error, count } = await ctx.supabase.from("contacts").update(r.row, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? uniqueError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("contacts.saved") })
}

export async function trashContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.contacts", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("contacts.trashed") })
}

export async function restoreContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.contacts", p_id: id })
  // A live contact took the email meanwhile → unique violation.
  if (error) back(`${PATH}/${id}`, { error: uniqueError(t, error) })
  back(`${PATH}/${id}`, { ok: t("contacts.restored") })
}

export async function addNote(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}/${id}`
  const body = String(fd.get("body") ?? "").trim()
  if (!body || body.length > 10000) back(here, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("contact_notes").insert({ org_id: ctx.org.id, contact_id: id, body })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("contacts.noteAdded") })
}

export async function deleteNote(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}/${idOf(fd)}`
  const { error, count } = await ctx.supabase
    .from("contact_notes")
    .delete({ count: "exact" })
    .eq("id", String(fd.get("note") ?? ""))
    .eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("contacts.noteDeleted") })
}

// CSV import (see importContactRows): the App's entry point.
export async function importContacts(input: { rows: Record<string, string>[]; mode: "skip" | "update" }): Promise<ImportOutcome> {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  if (!ctx.modules.has("crm")) return { error: t("errors.not_allowed") }
  const r = await importContactRows(ctx.supabase, ctx.org.id, input, t)
  if (!("error" in r)) deliverSoon()
  return r
}

/** Link this contact to a team member's App account (one person behind both), or unlink (user_id empty). */
export async function linkContactUser(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const user = String(fd.get("user_id") ?? "")
  const value = /^[0-9a-f-]{36}$/.test(user) ? user : null
  const { error } = await ctx.supabase.from("contacts").update({ user_id: value }).eq("id", id).eq("org_id", ctx.org.id)
  back(`${PATH}/${id}#team`, error ? { error: error.code === "23505" ? t("contacts.team.taken") : dbError(t, error) } : { ok: t(value ? "contacts.team.linked" : "contacts.team.unlinked") })
}

/** Bulk bar on the list: add/remove a tag on the ticked contacts, or move them to the trash. */
export async function bulkContacts(fd: FormData) {
  const { ctx, t } = await manager()
  const ids = [...new Set(fd.getAll("ids").map(String))].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 500)
  const intent = String(fd.get("intent") ?? "")
  const back$ = String(fd.get("back") ?? PATH)
  const to = back$.startsWith(PATH) ? back$ : PATH
  if (!ids.length) back(to, {})
  if (intent === "trash") {
    const results = await Promise.all(ids.map((id) => ctx.supabase.rpc("soft_delete", { p_table: "public.contacts", p_id: id })))
    const failed = results.find((r) => r.error)?.error
    back(to, failed ? { error: dbError(t, failed) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
  }
  const tag = String(fd.get("bulk_tag") ?? "").trim().slice(0, 100)
  if (!tag || (intent !== "tag-add" && intent !== "tag-remove")) back(to, { error: t("errors.invalid_input") })
  const { data } = await ctx.supabase.from("contacts").select("id, tags").eq("org_id", ctx.org.id).in("id", ids)
  const changes = (data ?? [])
    .map((c) => ({ id: c.id, tags: intent === "tag-add" ? [...new Set([...c.tags, tag])] : c.tags.filter((x) => x !== tag), before: c.tags.length }))
    .filter((c) => c.tags.length !== c.before)
  const results = await Promise.all(changes.map((c) => ctx.supabase.from("contacts").update({ tags: c.tags }).eq("id", c.id).eq("org_id", ctx.org.id)))
  const failed = results.find((r) => r.error)?.error
  back(to, failed ? { error: dbError(t, failed) } : { ok: t("common.bulkDone", { count: changes.length }) })
}
