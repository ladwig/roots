// Contacts logic shared by the App's Server Actions and the API. Takes any Supabase client + the org; the caller has
// checked the permission. Messages in `t`'s language (App: the user's, API: English).
import type { SupabaseClient } from "@supabase/supabase-js"
import { CONTACT_FIELDS, MAX_IMPORT_ROWS, readContact, type ContactRow } from "@/app/(app)/contacts/fields"
import type { ImportOutcome } from "@/components/csv-import"
import { dbError, type T } from "@/i18n/translate"
import { loadFields } from "@/lib/custom-fields"
import type { Database, TablesUpdate } from "@/lib/supabase/types"

type Db = SupabaseClient<Database>
const fieldError = (t: T, e: { error: string; field?: string }) => (e.field ? `${e.field}: ` : "") + t.dynamic(e.error)
export const uniqueError = (t: T, error: { code?: string; message: string }) => (error.code === "23505" ? t("errors.email_taken") : dbError(t, error))

// CSV import. Rows come mapped ({ "<field>" | "custom.<key>": text }); everything is validated again here.
// mode "skip": rows whose email already exists are skipped; "update": those contacts get the non-empty mapped values
// (tags added, custom fields merged). New contacts go in with one insert → one contacts.imported event.
export async function importContactRows(db: Db, orgId: string, input: { rows: Record<string, string>[]; mode: "skip" | "update" }, t: T): Promise<ImportOutcome> {
  if (!Array.isArray(input?.rows) || input.rows.length > MAX_IMPORT_ROWS) return { error: t("errors.invalid_input") }
  const allowed = new Set(CONTACT_FIELDS.map((f) => f.key))
  const defs = await loadFields(db, orgId, "contacts")
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
    const { data } = await db
      .from("contacts")
      .select("id, email, tags, custom")
      .eq("org_id", orgId)
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
    const { error } = await db.from("contacts").insert(inserts.map((v) => ({ ...v.row, org_id: orgId })))
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
          return db
            .from("contacts")
            .update(patch as TablesUpdate<"contacts">)
            .eq("id", old.id)
            .eq("org_id", orgId)
            .then(({ error }) => (error ? errors.push({ line, message: dbError(t, error) }) : updated++))
        }),
      )
    }
  }
  return { inserted, updated, skipped, errors: errors.sort((a, b) => a.line - b.line) }
}
