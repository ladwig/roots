// Member import: one CSV row = a person (contact fields) + their membership. Pure, shared by the import form,
// the server action and node --test. Relative .ts imports on purpose.
import { CONTACT_FIELDS, readContact, type ContactRow } from "../app/(app)/contacts/fields.ts"
import type { ImportField } from "../lib/csv.ts"
import { parseValue, type FieldDef } from "../lib/custom-fields.ts"

export const MEMBER_FIELDS: (ImportField & { label: string })[] = [
  { key: "membership.type", label: "membership.type", aliases: ["mitgliedsart", "beitragsart", "art", "typ", "membership type", "type", "beitragsgruppe", "status"] },
  { key: "membership.starts_on", label: "membership.since", aliases: ["eintritt", "eintrittsdatum", "mitglied seit", "beitritt", "member since", "joined", "start"] },
  { key: "membership.ends_on", label: "membership.until", aliases: ["austritt", "austrittsdatum", "mitglied bis", "left", "end"] },
  { key: "membership.number", label: "membership.importNumber", aliases: ["mitgliedsnummer", "mitgliedsnr", "mitgl.-nr.", "mitgl.nr", "nr", "nummer", "member number", "member no"] },
  { key: "membership.account_holder", label: "membership.accountHolder", aliases: ["kontoinhaber", "kontoinhaberin", "account holder"] },
  { key: "membership.iban", label: "IBAN", aliases: ["iban"] },
  { key: "membership.bic", label: "BIC", aliases: ["bic", "swift"] },
  { key: "membership.mandate_ref", label: "membership.mandateRef", aliases: ["mandatsreferenz", "mandat", "mandate reference"] },
  { key: "membership.mandate_signed_on", label: "membership.mandateSigned", aliases: ["mandatsdatum", "mandat vom", "mandate date", "unterschrift"] },
]
export const IMPORT_FIELDS = [...CONTACT_FIELDS, ...MEMBER_FIELDS]

export type MemberRow = {
  contact: ContactRow
  membership: {
    type_id: string
    starts_on: string
    ends_on: string | null
    number: number | null
    member_no: string | null
    account_holder: string | null
    iban: string | null
    bic: string | null
    mandate_ref: string | null
    mandate_signed_on: string | null
  }
}

const date = (raw: string) => parseValue({ key: "", label: "", type: "date", options: [], required: false }, raw)

/** A row → contact + membership, or an errors.* key. Types match by name; with one type it's the default. */
export function readMember(get: (key: string) => string, types: { id: string; name: string }[], defs: FieldDef[], today: string): { error: string; field?: string } | { row: MemberRow } {
  const c = readContact(get, defs)
  if ("error" in c) return c
  if (!c.row.first_name && !c.row.last_name && !c.row.company && !c.row.email) return { error: "errors.contact_needs_name" }
  const typeName = get("membership.type").trim().toLowerCase()
  const type = typeName ? types.find((x) => x.name.toLowerCase() === typeName) : types.length === 1 ? types[0] : undefined
  if (!type) return { error: "errors.unknown_membership_type", field: get("membership.type") || "–" }
  const starts = date(get("membership.starts_on"))
  const ends = date(get("membership.ends_on"))
  const signed = date(get("membership.mandate_signed_on"))
  if (starts.error || ends.error || signed.error) return { error: "errors.invalid_date" }
  const startsOn = (starts.value as string | undefined) ?? today
  const endsOn = (ends.value as string | undefined) ?? null
  if (endsOn && endsOn < startsOn) return { error: "errors.end_before_start" }
  const rawNo = get("membership.number").trim()
  const num = /^\D*(\d{1,9})$/.exec(rawNo)?.[1] // "M-0042" → 42, keeps "M-0042" as the shown number
  const iban = get("membership.iban").toUpperCase().replace(/\s/g, "") || null
  const bic = get("membership.bic").toUpperCase().replace(/\s/g, "") || null
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return { error: "errors.invalid_iban" }
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return { error: "errors.invalid_bic" }
  const ref = get("membership.mandate_ref").trim().slice(0, 35) || null
  return {
    row: {
      contact: c.row,
      membership: {
        type_id: type.id,
        starts_on: startsOn,
        ends_on: endsOn,
        number: num ? Number(num) : null,
        member_no: num ? rawNo.slice(0, 60) : null,
        account_holder: get("membership.account_holder").trim().slice(0, 70) || null,
        iban,
        bic,
        mandate_ref: iban ? ref : null,
        mandate_signed_on: iban ? ((signed.value as string | undefined) ?? startsOn) : null,
      },
    },
  }
}
