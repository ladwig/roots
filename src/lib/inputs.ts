// Checks + display formats for typed inputs (IBAN, BIC, postcode, phone, money). Pure (no imports), so the
// <TypedInput> in the browser, server actions, validators and node --test share them.

/** Every password form (sign-up, invite, reset) checks this; the texts show it as {min}. */
export const MIN_PASSWORD = 8

/** "de89 3704 0044 0532 0130 00" → "DE89370400440532013000" (null when empty). */
export const compactIban = (v: string | null | undefined) => v?.toUpperCase().replace(/[\s-]/g, "") || null

/** Real IBAN check: country + check digits, length 15–34, mod-97 = 1 (catches typos, not just the shape). */
export function ibanValid(v: string | null | undefined) {
  const s = compactIban(v)
  if (!s || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)) return false
  if (s.startsWith("DE") && s.length !== 22) return false
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  return rest === 1
}

/** Groups of four, as printed on cards and statements. */
export const formatIban = (v: string) => (compactIban(v) ?? "").replace(/(.{4})(?=.)/g, "$1 ")

export const bicValid = (v: string | null | undefined) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v?.toUpperCase().replace(/\s/g, "") ?? "")

/** Postcodes worldwide are 3–10 letters/digits; Germany (or no country) wants exactly five digits. */
export const postcodeValid = (v: string, country?: string | null) => (!country || country === "DE" ? /^\d{5}$/.test(v.trim()) : /^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/i.test(v.trim()))

/** Digits with the usual separators (+49 30 123456, 030/123 45-6), at least six digits. */
export const phoneValid = (v: string) => /^\+?[\d\s()/.-]+$/.test(v.trim()) && v.replace(/\D/g, "").length >= 6

/** Euro text ("12,50", "1.234,5", "12.5 €", "0") → cents (≥ 0), or null. */
export function moneyCents(raw: string) {
  const v = raw.trim().replace(/\s|€/g, "")
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(v)) return null
  const n = Math.round(Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) * 100)
  return n < 100_000_000_00 ? n : null
}

/** Cents → "1.234,50" (German input format, no currency sign: the field shows €). */
export const formatMoney = (cents: number) => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
