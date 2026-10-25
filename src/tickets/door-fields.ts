// Door sales, pure parts (form, API, test): the event's door settings and a sale's lines.
export const DOOR_METHODS = ["cash", "qr", "terminal"] as const
export type DoorMethod = (typeof DOOR_METHODS)[number]
export type DoorSettings = { methods: DoorMethod[]; reader_id: string | null; cash_account_id: string | null }
export type DoorLine = { typeId: string | null; label: string; price: number; quantity: number }

const UUID = /^[0-9a-f-]{36}$/

/** events.door → settings (all methods on by default). */
export function readDoor(raw: unknown): DoorSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const methods = Array.isArray(d.methods) ? DOOR_METHODS.filter((m) => (d.methods as unknown[]).includes(m)) : [...DOOR_METHODS]
  return {
    methods,
    reader_id: typeof d.reader_id === "string" && d.reader_id.trim() ? d.reader_id.trim().slice(0, 100) : null,
    cash_account_id: typeof d.cash_account_id === "string" && UUID.test(d.cash_account_id) ? d.cash_account_id : null,
  }
}

/** A sale's lines: tickets (typeId) or free amounts (label), each with price in cents and quantity. */
export function readLines(raw: unknown): DoorLine[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) return null
  const lines: DoorLine[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const typeId = typeof r?.typeId === "string" && UUID.test(r.typeId) ? r.typeId : null
    const label = String(r?.label ?? "").trim().slice(0, 100)
    const price = Number(r?.price)
    const quantity = Number(r?.quantity)
    if (!Number.isInteger(price) || price < 0 || price > 10_000_000 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null
    if (!typeId && !label) return null
    lines.push({ typeId, label, price, quantity })
  }
  if (lines.filter((l) => l.typeId).reduce((n, l) => n + l.quantity, 0) > 200) return null
  return lines
}

export const lineTotal = (lines: DoorLine[]) => lines.reduce((s, l) => s + l.price * l.quantity, 0)
