// Letter templates: extra fields, placeholders and filling. Pure (no DB, no i18n), shared by the live preview in the
// browser, the PDF/save/send actions on the server and the tests.

export const FIELD_TYPES = ["text", "date", "textarea"] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export type LetterField = { key: string; label: string; type: FieldType }
export type Vars = Record<string, string>

/** Filled from the contact, their membership and the org; template fields can't reuse these keys. */
export const PLACEHOLDERS = [
  "name",
  "first_name",
  "last_name",
  "company",
  "email",
  "street",
  "postal_code",
  "city",
  "member_number",
  "member_since",
  "member_until",
  "member_type",
  "rental_object",
  "rental_start",
  "rental_end",
  "rental_rent",
  "rental_deposit",
  "rental_notice",
  "rental_people",
  "org",
  "today",
] as const

const KEY = /^[a-z][a-z0-9_]{0,39}$/

/** Template fields from a form/DB value: valid keys, unique, not a built-in placeholder, at most 20. */
export function readFields(raw: unknown): LetterField[] {
  if (!Array.isArray(raw)) return []
  const out: LetterField[] = []
  for (const f of raw.slice(0, 20)) {
    if (!f || typeof f !== "object") continue
    const { key, label, type } = f as Record<string, unknown>
    const k = String(key ?? "").trim()
    const l = String(label ?? "").trim().slice(0, 80)
    if (!KEY.test(k) || !l || (PLACEHOLDERS as readonly string[]).includes(k) || out.some((x) => x.key === k)) continue
    out.push({ key: k, label: l, type: (FIELD_TYPES as readonly string[]).includes(String(type)) ? (type as FieldType) : "text" })
  }
  return out
}

/** Key for a new field from its label ("Datum der Veranstaltung" → "datum_der_veranstaltung"). */
export const fieldKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 40) || "feld"

/** The values typed into a template's fields; dates formatted with `date` (ISO yyyy-mm-dd in). */
export function fieldVars(fields: LetterField[], values: Record<string, string>, date: (iso: string) => string): Vars {
  const out: Vars = {}
  for (const f of fields) {
    const v = String(values[f.key] ?? "").slice(0, 5000)
    out[f.key] = f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? date(v) : v
  }
  return out
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Body HTML with {placeholders} replaced (escaped; line breaks from textarea fields become <br>). Unknown keys → "". */
export const fillHtml = (html: string, vars: Vars) => cleanHtml(html).replace(/\{([a-z][a-z0-9_]*)\}/g, (_, k: string) => esc(vars[k] ?? "").replace(/\n/g, "<br>"))

/** Plain text (title, file name) with {placeholders} replaced. */
export const fillText = (text: string, vars: Vars) =>
  text
    .replace(/\{([a-z][a-z0-9_]*)\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/\s+/g, " ")
    .trim()

/** Stored body: what the editor produces, minus scripts and event handlers. */
export const cleanHtml = (html: string) =>
  html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
