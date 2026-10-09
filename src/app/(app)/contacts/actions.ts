"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import type { TablesUpdate } from "@/lib/supabase/types"
import { back } from "@/lib/url"
import { CONTACT_FIELDS, fromForm, MAX_IMPORT_ROWS, readContact, type ContactRow } from "./fields"

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

const uniqueError = (t: Awaited<ReturnType<typeof getT>>, error: { code?: string; message: string }) =>
  error.code === "23505" ? t("errors.email_taken") : dbError(t, error)

export async function createContact(fd: FormData) {
  const { ctx, t } = await manager()
  const r = await readForm(ctx, fd)
  if ("error" in r) back(`${PATH}?new=contact`, { error: fieldError(t, r) })
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

// CSV import. Rows come mapped from the browser ({ "<field>" | "custom.<key>": text }); everything is validated again here.
// mode "skip": rows whose email already exists are skipped; "update": those contacts get the non-empty mapped values
// (tags added, custom fields merged). New contacts go in with one insert → one contacts.imported event.
export type ImportResult = { inserted: number; updated: number; skipped: number; errors: { line: number; message: string }[] } | { error: string }

export async function importContacts(input: { rows: Record<string, string>[]; mode: "skip" | "update" }): Promise<ImportResult> {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  if (!ctx.modules.has("crm")) return { error: t("errors.not_allowed") }
  if (!Array.isArray(input?.rows) || input.rows.length > MAX_IMPORT_ROWS) return { error: t("errors.invalid_input") }
  const allowed = new Set(CONTACT_FIELDS.map((f) => f.key))
  const defs = await loadFields(ctx.supabase, ctx.org.id, "contacts")
  defs.forEach((d) => allowed.add(`custom.${d.key}`))
  // Required custom fields: a "skip" import only creates contacts, so they must be in the file; an update import
  // may leave them out (then only rows that create a new contact need them, checked per row below).
  const mapped = new Set(Object.keys(input.rows[0] ?? {}))
  const missing = defs.filter((d) => d.required && !mapped.has(`custom.${d.key}`)).map((d) => d.label)
  if (input.mode === "skip" && missing.length) return { error: t("errors.required_columns", { fields: t.list(missing) }) }
  const checkDefs = defs.map((d) => ({ ...d, required: d.required && mapped.has(`custom.${d.key}`) }))

  const errors: { line: number; message: string }[] = []
  const valid: { line: number; row: ContactRow; given: Set<string> }[] = []
  const seen = new Set<string>()
  let skipped = 0
  input.rows.forEach((raw, i) => {
    const line = i + 2 // header is line 1
    const get = (k: string) => (allowed.has(k) && typeof raw?.[k] === "string" ? raw[k] : "")
    const r = readContact(get, checkDefs)
    if ("error" in r) return void errors.push({ line, message: fieldError(t, r) })
    if (r.row.email && seen.has(r.row.email)) return void skipped++ // same email twice in the file: first one wins
    if (r.row.email) seen.add(r.row.email)
    valid.push({ line, row: r.row, given: new Set(Object.keys(raw).filter((k) => allowed.has(k) && raw[k].trim())) })
  })

  // Existing contacts by email (live ones; the unique index ignores the trash).
  const emails = valid.map((v) => v.row.email).filter((e): e is string => !!e)
  const existing = new Map<string, { id: string; tags: string[]; custom: Record<string, unknown> }>()
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await ctx.supabase
      .from("contacts")
      .select("id, email, tags, custom")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .in("email", emails.slice(i, i + 500))
    data?.forEach((c) => existing.set(c.email!, { id: c.id, tags: c.tags, custom: c.custom as Record<string, unknown> }))
  }

  let inserts = valid.filter((v) => !v.row.email || !existing.has(v.row.email))
  if (missing.length) {
    // Update import without the required columns: only existing contacts can be updated.
    const msg = t("errors.required_columns", { fields: t.list(missing) })
    inserts.forEach((v) => errors.push({ line: v.line, message: msg }))
    inserts = []
  }
  const updates = valid.filter((v) => v.row.email && existing.has(v.row.email))
  if (input.mode !== "update") skipped += updates.length

  let inserted = 0
  if (inserts.length) {
    const { error } = await ctx.supabase.from("contacts").insert(inserts.map((v) => ({ ...v.row, org_id: ctx.org.id })))
    if (error) return { error: uniqueError(t, error) }
    inserted = inserts.length
  }

  let updated = 0
  if (input.mode === "update") {
    // ponytail: one update per contact, 20 at a time; an update RPC if imports of many thousands get slow.
    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(
        updates.slice(i, i + 20).map(({ line, row, given }) => {
          const old = existing.get(row.email!)!
          const patch: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(row)) if (given.has(k) && k !== "tags" && k !== "custom") patch[k] = v
          if (row.tags.length) patch.tags = [...new Set([...old.tags, ...row.tags])].slice(0, 50)
          if (Object.keys(row.custom).length) patch.custom = { ...old.custom, ...row.custom }
          return ctx.supabase
            .from("contacts")
            .update(patch as TablesUpdate<"contacts">)
            .eq("id", old.id)
            .then(({ error }) => (error ? errors.push({ line, message: dbError(t, error) }) : updated++))
        }),
      )
    }
  }
  deliverSoon()
  return { inserted, updated, skipped, errors: errors.sort((a, b) => a.line - b.line) }
}
