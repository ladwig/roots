// Contact fields: parsing + validation shared by the form, the CSV import and (later) the API.
// Relative .ts import so node --test can load this file.
import { parseValue, readCustom, type CustomValues, type FieldDef } from "../../../lib/custom-fields.ts"
import type { ImportField } from "../../../lib/csv.ts"

export const MAX_IMPORT_ROWS = 5000
export const COUNTRIES = ["DE", "AT", "CH", "LI", "LU", "NL", "BE", "FR", "IT", "ES", "PL", "CZ", "DK", "SE", "NO", "GB", "IE", "US"]

// Built-in fields for the CSV column mapping. Labels are message keys; aliases help guess the column.
export const CONTACT_FIELDS: (ImportField & { label: string })[] = [
  { key: "first_name", label: "contacts.firstName", aliases: ["first name", "firstname", "vorname", "given name"] },
  { key: "last_name", label: "contacts.lastName", aliases: ["last name", "lastname", "nachname", "surname", "familienname", "name"] },
  { key: "company", label: "contacts.company", aliases: ["firma", "company", "organisation", "organization", "verein", "unternehmen"] },
  { key: "email", label: "contacts.email", aliases: ["email", "e-mail", "mail", "e-mail-adresse", "email address", "emailadresse"] },
  { key: "phone", label: "contacts.phone", aliases: ["telefon", "phone", "tel", "handy", "mobil", "mobile", "telefonnummer"] },
  { key: "street", label: "contacts.street", aliases: ["straße", "strasse", "street", "adresse", "address", "anschrift"] },
  { key: "postal_code", label: "contacts.postalCode", aliases: ["plz", "postleitzahl", "zip", "postcode", "postal code"] },
  { key: "city", label: "contacts.city", aliases: ["ort", "stadt", "city", "wohnort"] },
  { key: "country", label: "contacts.country", aliases: ["land", "country"] },
  { key: "birthday", label: "contacts.birthday", aliases: ["geburtstag", "geburtsdatum", "birthday", "date of birth", "dob"] },
  { key: "tags", label: "contacts.tags", aliases: ["tags", "gruppen", "kategorie", "labels"] },
]

// "VIP, Mitglied ,vip" → ["VIP", "Mitglied"] (trimmed, case-insensitive unique, max 40 chars, max 50 tags)
export const parseTags = (raw: string) => {
  const seen = new Set<string>()
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim().slice(0, 40))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 50)
}

// "DE", "Deutschland", "Germany" → "DE"
const countryNames = new Map(
  COUNTRIES.flatMap((c) => [c, ...["de", "en"].map((l) => new Intl.DisplayNames([l], { type: "region" }).of(c)!)].map((n) => [n.toLowerCase(), c])),
)

export const contactName = (c: { first_name: string | null; last_name: string | null; company: string | null; email: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email || "–"

export type ContactRow = {
  first_name: string | null
  last_name: string | null
  company: string | null
  email: string | null
  phone: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  birthday: string | null
  tags: string[]
  custom: CustomValues
}

// `get(key)` returns the raw text of a built-in field or of a custom field ("custom.<key>").
// Returns the row or an errors.* key (+ the field's name for custom fields).
export function readContact(get: (key: string) => string, defs: FieldDef[]): { error: string; field?: string } | { row: ContactRow } {
  const text = (key: string, max: number) => get(key).trim().slice(0, max) || null
  const email = text("email", 320)?.toLowerCase() ?? null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "errors.invalid_email" }
  const bday = parseValue({ key: "birthday", label: "", type: "date", options: [], required: false }, get("birthday"))
  if (bday.error) return { error: bday.error }
  const countryRaw = text("country", 60)
  const country = countryRaw ? (countryNames.get(countryRaw.toLowerCase()) ?? null) : null
  if (countryRaw && !country) return { error: "errors.invalid_country" }
  const c = readCustom(defs, (k) => get(`custom.${k}`))
  if ("error" in c) return c
  const row = {
    first_name: text("first_name", 100),
    last_name: text("last_name", 100),
    company: text("company", 200),
    email,
    phone: text("phone", 50),
    street: text("street", 200),
    postal_code: text("postal_code", 20),
    city: text("city", 100),
    country,
    birthday: (bday.value as string | undefined) ?? null,
    tags: parseTags(get("tags")),
    custom: c.custom,
  }
  if (!row.first_name && !row.last_name && !row.company && !row.email) return { error: "errors.contact_needs_name" }
  return { row }
}

export const fromForm = (fd: FormData) => (key: string) => String(fd.get(key) ?? "")
