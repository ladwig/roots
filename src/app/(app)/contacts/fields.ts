// Contact fields: form parsing + validation (shared by the form actions; later CSV import and the API).

export const COUNTRIES = ["DE", "AT", "CH", "LI", "LU", "NL", "BE", "FR", "IT", "ES", "PL", "CZ", "DK", "SE", "NO", "GB", "IE", "US"]

const text = (fd: FormData, key: string, max: number) => {
  const v = String(fd.get(key) ?? "").trim()
  return v ? v.slice(0, max) : null
}

// "VIP, Mitglied ,vip" → ["VIP", "Mitglied"] (trimmed, case-insensitive unique, max 40 chars, max 50 tags)
export const parseTags = (raw: string) => {
  const seen = new Set<string>()
  return raw
    .split(",")
    .map((s) => s.trim().slice(0, 40))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 50)
}

export const contactName = (c: { first_name: string | null; last_name: string | null; company: string | null; email: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email || "–"

type ContactRow = {
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
}

// Returns the row or an errors.* key.
export function readContact(fd: FormData): { error: string } | { row: ContactRow } {
  const email = text(fd, "email", 320)?.toLowerCase() ?? null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "errors.invalid_email" }
  const birthday = text(fd, "birthday", 10)
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return { error: "errors.invalid_input" }
  const country = text(fd, "country", 2)
  if (country && !COUNTRIES.includes(country)) return { error: "errors.invalid_input" }
  const row = {
    first_name: text(fd, "first_name", 100),
    last_name: text(fd, "last_name", 100),
    company: text(fd, "company", 200),
    email,
    phone: text(fd, "phone", 50),
    street: text(fd, "street", 200),
    postal_code: text(fd, "postal_code", 20),
    city: text(fd, "city", 100),
    country,
    birthday,
    tags: parseTags(String(fd.get("tags") ?? "")),
  }
  if (!row.first_name && !row.last_name && !row.company && !row.email) return { error: "errors.contact_needs_name" }
  return { row }
}
