// Forms: element model, the catalog of platform fields a form can use, templates per purpose and the validator for
// submissions. Pure (relative .ts imports) so the builder, the public page, the action and node --test share it.
import { readContact, type ContactRow } from "../app/(app)/contacts/fields.ts"
import type { FieldDef } from "../lib/custom-fields.ts"
import { ibanValid } from "../lib/inputs.ts"

export type Purpose = "contact" | "membership"
export const PURPOSES: Purpose[] = ["contact", "membership"]

export type Element =
  | { id: string; kind: "field"; field: string; label?: string; required: boolean; help?: string }
  | { id: string; kind: "text"; body: string }
  | { id: string; kind: "consent"; label: string; required: boolean }
  | { id: string; kind: "mandate" } // SEPA direct debit mandate: holder, IBAN, BIC + legal text

// Platform fields. Labels are message keys; custom contact fields come as "custom.<key>" from the org's definitions.
export const CONTACT_INPUTS: Record<string, { label: string; type: "text" | "email" | "tel" | "date" | "country" }> = {
  first_name: { label: "contacts.firstName", type: "text" },
  last_name: { label: "contacts.lastName", type: "text" },
  company: { label: "contacts.company", type: "text" },
  email: { label: "contacts.email", type: "email" },
  phone: { label: "contacts.phone", type: "tel" },
  street: { label: "contacts.street", type: "text" },
  postal_code: { label: "contacts.postalCode", type: "text" },
  city: { label: "contacts.city", type: "text" },
  country: { label: "contacts.country", type: "country" },
  birthday: { label: "contacts.birthday", type: "date" },
}
export const MEMBERSHIP_INPUTS: Record<string, { label: string; type: "type" | "date" }> = {
  "membership.type": { label: "forms.fields.membershipType", type: "type" },
  "membership.starts_on": { label: "forms.fields.startsOn", type: "date" },
}
export const isKnownField = (field: string, purpose: Purpose, customKeys: string[]) =>
  field in CONTACT_INPUTS || (purpose === "membership" && field in MEMBERSHIP_INPUTS) || (field.startsWith("custom.") && customKeys.includes(field.slice(7)))

const id = () => Math.random().toString(36).slice(2, 10)
const field = (f: string, required = false): Element => ({ id: id(), kind: "field", field: f, required })

/** Starting elements for a new form; texts the org edits afterwards. */
export function template(purpose: Purpose, t: { privacy: string; statutes: string }): Element[] {
  if (purpose === "membership")
    return [
      field("first_name", true),
      field("last_name", true),
      field("email", true),
      field("phone"),
      field("street", true),
      field("postal_code", true),
      field("city", true),
      field("birthday"),
      field("membership.type", true),
      field("membership.starts_on"),
      { id: id(), kind: "mandate" },
      { id: id(), kind: "consent", label: t.statutes, required: true },
      { id: id(), kind: "consent", label: t.privacy, required: true },
    ]
  return [field("first_name", true), field("last_name"), field("email", true), field("phone"), { id: id(), kind: "consent", label: t.privacy, required: true }]
}

export type Submission = {
  contact: Omit<ContactRow, "custom">
  custom: ContactRow["custom"]
  membership?: { type_id: string; starts_on: string | null; account_holder: string | null; iban: string | null; bic: string | null }
  consents: { label: string; accepted: boolean }[]
}

/**
 * Raw form values → submission, or an errors.* key (+ the field's label for the message).
 * Only fields the form contains are read; required = the element's flag.
 */
export function readSubmission(
  els: Element[],
  get: (key: string) => string,
  ctx: { purpose: Purpose; customDefs: FieldDef[]; typeIds: string[]; today: string },
): { error: string; field?: string } | { data: Submission } {
  const fields = els.filter((e): e is Extract<Element, { kind: "field" }> => e.kind === "field")
  const has = (f: string) => fields.some((e) => e.field === f)
  for (const e of fields) if (e.required && !get(e.field).trim()) return { error: "errors.field_required", field: e.label || e.field }
  // Contact part: only the included built-ins and custom fields count.
  const defs = ctx.customDefs.filter((d) => has(`custom.${d.key}`)).map((d) => ({ ...d, required: fields.find((e) => e.field === `custom.${d.key}`)!.required }))
  const r = readContact((k) => (has(k) ? get(k) : ""), defs)
  if ("error" in r) return r
  const { custom, ...contact } = r.row // tags stay empty: forms never set them, the form's settings add them
  if (!contact.first_name && !contact.last_name && !contact.company && !contact.email) return { error: "errors.contact_needs_name" }

  let membership: Submission["membership"]
  if (ctx.purpose === "membership") {
    const typeId = get("membership.type")
    if (!ctx.typeIds.includes(typeId)) return { error: "errors.invalid_option", field: "membership.type" }
    const starts = get("membership.starts_on").trim()
    if (starts && (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || starts < ctx.today)) return { error: "errors.invalid_date", field: "membership.starts_on" }
    membership = { type_id: typeId, starts_on: starts || null, account_holder: null, iban: null, bic: null }
    if (els.some((e) => e.kind === "mandate")) {
      const iban = get("iban").toUpperCase().replace(/\s/g, "")
      const bic = get("bic").toUpperCase().replace(/\s/g, "")
      if (!ibanValid(iban)) return { error: "errors.invalid_iban" }
      if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return { error: "errors.invalid_bic" }
      if (get("mandate_ok") !== "on") return { error: "errors.mandate_required" }
      Object.assign(membership, { iban, bic: bic || null, account_holder: get("account_holder").trim().slice(0, 70) || null })
    }
  }
  const consents: Submission["consents"] = []
  for (const e of els)
    if (e.kind === "consent") {
      const accepted = get(`consent.${e.id}`) === "on"
      if (e.required && !accepted) return { error: "errors.consent_required", field: e.label }
      consents.push({ label: e.label, accepted })
    }
  return { data: { contact, custom, membership, consents } }
}

/**
 * A whole element list set at once (API): the same rules the builder enforces one step at a time. Returns an
 * errors.* key or null. Known fields only (custom = the org's contact field keys), each field once, the mandate
 * only on membership forms and only once, unique ids, consent labels not empty.
 */
export function checkElements(els: Element[], purpose: Purpose, customKeys: string[]): string | null {
  const ids = new Set<string>()
  const fields = new Set<string>()
  let mandates = 0
  for (const e of els) {
    if (!e.id || ids.has(e.id)) return "errors.invalid_input"
    ids.add(e.id)
    if (e.kind === "field") {
      if (!isKnownField(e.field, purpose, customKeys) || fields.has(e.field)) return "errors.invalid_input"
      fields.add(e.field)
    }
    if (e.kind === "consent" && !e.label.trim()) return "errors.invalid_input"
    if (e.kind === "mandate" && (purpose !== "membership" || ++mandates > 1)) return "errors.invalid_input"
  }
  return els.length > 100 ? "errors.invalid_input" : null
}
