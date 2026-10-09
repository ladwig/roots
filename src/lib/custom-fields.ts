// Custom fields (generic). Definitions: public.custom_fields (per org + entity); values: the entity's `custom` jsonb.
// One validator for every way data comes in (form, CSV import, API), so values always have the right shape.
// New entity: add it to the DB check on custom_fields.entity, give its table a `custom jsonb` column, add it below.

export const CUSTOM_ENTITIES = { contacts: { module: "crm" } } as const
export type CustomEntity = keyof typeof CUSTOM_ENTITIES
export const FIELD_TYPES = ["text", "number", "date", "boolean", "select", "email", "url"] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export type FieldDef = { key: string; label: string; type: string; options: string[]; required: boolean }
export type CustomValue = string | number | boolean
export type CustomValues = Record<string, CustomValue>

const TRUE = ["1", "true", "ja", "yes", "x", "on", "wahr"]
const FALSE = ["", "0", "false", "nein", "no", "off", "falsch"]

// Raw text (form field / CSV cell) → stored value, or an errors.* key. Empty → undefined (not stored).
export function parseValue(def: FieldDef, raw: string): { value?: CustomValue; error?: string } {
  const v = raw.trim()
  if (def.type === "boolean") {
    const l = v.toLowerCase()
    if (TRUE.includes(l)) return { value: true }
    if (FALSE.includes(l)) return {}
    return { error: "errors.invalid_input" }
  }
  if (!v) return {}
  switch (def.type) {
    case "number": {
      // German "1.234,5" and plain "1234.5"
      const n = Number(/,\d+$/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v)
      return Number.isFinite(n) ? { value: n } : { error: "errors.invalid_number" }
    }
    case "date": {
      const de = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
      const iso = de ? `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}` : v
      const d = new Date(`${iso}T00:00:00Z`)
      return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(d.getTime()) && d.toISOString().startsWith(iso)
        ? { value: iso }
        : { error: "errors.invalid_date" }
    }
    case "select": {
      const opt = def.options.find((o) => o.toLowerCase() === v.toLowerCase())
      return opt ? { value: opt } : { error: "errors.invalid_option" }
    }
    case "email":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { value: v.toLowerCase().slice(0, 320) } : { error: "errors.invalid_email" }
    case "url":
      return /^https?:\/\/\S+$/i.test(v) ? { value: v.slice(0, 2000) } : { error: "errors.invalid_url" }
    default:
      return { value: v.slice(0, 2000) }
  }
}

// All definitions → values; `get(key)` returns the raw text for a field. Errors name the field.
export function readCustom(defs: FieldDef[], get: (key: string) => string): { custom: CustomValues } | { error: string; field: string } {
  const custom: CustomValues = {}
  for (const def of defs) {
    const r = parseValue(def, get(def.key))
    if (r.error) return { error: r.error, field: def.label }
    if (r.value === undefined) {
      if (def.required && def.type !== "boolean") return { error: "errors.field_required", field: def.label }
    } else custom[def.key] = r.value
  }
  return { custom }
}

// Stored value → text for inputs / display.
export const formatValue = (v: CustomValue | undefined) => (v === undefined ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v))

// "Mitglieds-Nr." → "mitglieds_nr" (key for a new field)
export const fieldKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 40) || "field"

// Definitions for one entity of an org, in display order.
export async function loadFields(
  supabase: { from: (t: "custom_fields") => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- any Supabase client
  orgId: string,
  entity: CustomEntity,
): Promise<FieldDef[]> {
  const { data } = await supabase
    .from("custom_fields")
    .select("key, label, type, options, required")
    .eq("org_id", orgId)
    .eq("entity", entity)
    .order("position")
    .order("created_at")
  return data ?? []
}
