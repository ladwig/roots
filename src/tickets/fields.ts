// Ticket types, price tiers and codes: the rules the App forms and the API share. Each check returns a message key
// (errors.* / tickets.*) or null. Times are ISO strings, prices integer cents.
export const CODE_KINDS = ["percent", "amount", "none"] as const
export const CODE_FORMAT = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/
export const MAX_PRICE = 99_999_999 // what parsePrice accepts (999 999,99)

/** "early bird 10" → "EARLY-BIRD-10" */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "-")

const quotaOk = (q: number | null) => q === null || (Number.isInteger(q) && q > 0)
const before = (a: string | null, b: string | null) => !a || !b || Date.parse(b) > Date.parse(a)

export function checkTicketType(t: { name: string; quota: number | null; sales_start: string | null; sales_end: string | null }) {
  if (!t.name || t.name.length > 100 || !quotaOk(t.quota)) return "errors.invalid_input"
  if (!before(t.sales_start, t.sales_end)) return "errors.end_before_start"
  return null
}

export function checkTier(t: { name: string; quota: number | null; position: number }) {
  if (!t.name || t.name.length > 100 || !quotaOk(t.quota) || !Number.isInteger(t.position)) return "errors.invalid_input"
  return null
}

export function checkCode(c: { code: string; kind: string; value: number | null; max_uses: number | null; valid_from: string | null; valid_until: string | null }) {
  if (!CODE_FORMAT.test(c.code)) return "tickets.codeFormat"
  const v = c.value
  if (!(CODE_KINDS as readonly string[]).includes(c.kind) || v === null || !Number.isInteger(v) || v < 0 || (c.kind === "percent" && (v < 1 || v > 100)))
    return "tickets.codeValue"
  if (!quotaOk(c.max_uses)) return "errors.invalid_input"
  if (!before(c.valid_from, c.valid_until)) return "errors.end_before_start"
  return null
}
