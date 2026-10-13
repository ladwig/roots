// Number ranges (one tool for every running number: invoice, quote, member; later customer numbers). The database
// assigns the numbers (format_document_number(), take_number()); this mirrors the format for validation + preview.
// Pure, shared by the forms, the API and node --test.

export const RANGE_KINDS = {
  invoice: { module: "invoices", fallback: "RE-{YYYY}-{NNNN}", yearlyReset: true },
  quote: { module: "invoices", fallback: "AN-{YYYY}-{NNNN}", yearlyReset: true },
  member: { module: "members", fallback: "{N}", yearlyReset: false },
} as const
export type RangeKind = keyof typeof RANGE_KINDS

const PLACEHOLDERS = /\{(YYYY|YY|MM|BYYYY|BY|N+|RAND\d{1,2})\}/g

/** Needs {N…} or {RANDn}; besides placeholders only A–Z, 0–9 and - _ / . # */
export const validRangeFormat = (format: string) =>
  format.length <= 60 && /\{N+\}|\{RAND\d{1,2}\}/.test(format) && !/[^A-Za-z0-9\-_/.#]/.test(format.replace(PLACEHOLDERS, ""))

/** What a number will look like (random parts as X). */
export function previewNumber(format: string, n: number, date: string, birth?: string | null) {
  const [y, m] = date.split("-")
  return format.replace(PLACEHOLDERS, (_, p: string) =>
    p === "YYYY" ? y
    : p === "YY" ? y.slice(2)
    : p === "MM" ? m
    : p === "BYYYY" ? (birth?.slice(0, 4) ?? "0000")
    : p === "BY" ? (birth?.slice(2, 4) ?? "00")
    : p.startsWith("RAND") ? "X".repeat(Math.min(Math.max(Number(p.slice(4)), 1), 20))
    : String(n).padStart(p.length, "0"),
  )
}
