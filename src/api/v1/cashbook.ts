import { z } from "zod"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { ACCOUNT_KINDS, readEntry, SPHERES } from "@/cashbook/fields"
import { bookEntry, closeMonth, reverseEntry, type CashFail } from "@/cashbook/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { berlinToday, day, ts, type Db } from "./shared"

const TAG = "Cash book"
const en = createT("en", messages.en)
function fail(f: CashFail): never {
  if (f.db) throw dbError(f.db)
  throw new ApiError(422, f.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), en.dynamic(f.error))
}

const Account = z.object({ id: uuid, name: z.string(), kind: z.enum(ACCOUNT_KINDS), opening_cents: z.number().int(), opening_on: day, active: z.boolean(), balance_cents: z.number().int().describe("Balance today") })
const Entry = z.object({
  id: uuid,
  account_id: uuid,
  number: z.string().nullable().describe("Running number from the cash number range"),
  booked_on: day,
  amount_cents: z.number().int().describe("+ income, − expense"),
  description: z.string(),
  category: z.string().nullable(),
  sphere: z.enum(SPHERES).nullable().describe("ideal = ideeller Bereich, asset = Vermögensverwaltung, purpose = Zweckbetrieb, commercial = wirtschaftlicher Geschäftsbetrieb"),
  counterparty: z.string().nullable(),
  contact_id: uuid.nullable(),
  document_id: uuid.nullable().describe("Invoice this payment settled"),
  reverses_id: uuid.nullable().describe("This entry reverses that one"),
  created_at: ts,
})
const ENTRY_COLS = "id, account_id, number, booked_on, amount_cents, description, category, sphere, counterparty, contact_id, document_id, reverses_id, created_at"
const Closing = z.object({ id: uuid, account_id: uuid, month: z.string().describe("YYYY-MM"), balance_cents: z.number().int(), counted_cents: z.number().int().nullable(), note: z.string().nullable(), created_at: ts })

async function accountOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("cash_accounts").select("id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/cash-accounts",
    permission: "cashbook.view",
    tag: TAG,
    summary: "List cash accounts with their balance",
    response: z.object({ data: z.array(Account) }),
    async handler({ db, orgId }) {
      const [{ data }, { data: bal }] = await Promise.all([
        db.from("cash_accounts").select("id, name, kind, opening_cents, opening_on, active").eq("org_id", orgId).order("name"),
        db.rpc("cash_balances", { p_org: orgId }),
      ])
      return { data: (data ?? []).map((a) => ({ ...a, kind: a.kind as "cash", balance_cents: Number(bal?.find((b) => b.account_id === a.id)?.balance_cents ?? a.opening_cents) })) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/cash-accounts",
    permission: "cashbook.manage",
    tag: TAG,
    summary: "Create a cash account",
    body: z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(ACCOUNT_KINDS).default("cash"), opening_cents: z.number().int().default(0), opening_on: day.optional() }).strict(),
    response: Account,
    status: 201,
    async handler({ db, orgId, body }) {
      const { data, error } = await db
        .from("cash_accounts")
        .insert({ org_id: orgId, name: body.name, kind: body.kind, opening_cents: body.opening_cents, opening_on: body.opening_on ?? berlinToday() })
        .select("id, name, kind, opening_cents, opening_on, active")
        .single()
      if (error) throw dbError(error)
      return { ...data, kind: data.kind as "cash", balance_cents: data.opening_cents }
    },
  }),
  endpoint({
    method: "GET",
    path: "/cash-entries",
    permission: "cashbook.view",
    tag: TAG,
    summary: "List entries",
    description: "Oldest first within the range.",
    query: page.extend({ account_id: uuid.optional(), from: day.optional(), to: day.optional() }),
    response: list(Entry),
    async handler({ db, orgId, query }) {
      let q = db.from("cash_entries").select(ENTRY_COLS).eq("org_id", orgId).order("booked_on").order("number").range(query.offset, query.offset + query.limit)
      if (query.account_id) q = q.eq("account_id", query.account_id)
      if (query.from) q = q.gte("booked_on", query.from)
      if (query.to) q = q.lte("booked_on", query.to)
      const { data } = await q
      return paged(data as z.infer<typeof Entry>[] | null, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/cash-entries",
    permission: "cashbook.manage",
    tag: TAG,
    summary: "Book an entry",
    description:
      "Gets the next number of the cash range. Booked entries can't be changed or deleted (correct with POST /cash-entries/{id}/reverse); a closed month takes no entries (`cash_month_closed`). With `document_id` (an open invoice, income only) the invoice is marked paid.",
    body: z
      .object({
        account_id: uuid,
        direction: z.enum(["in", "out"]),
        amount_cents: z.number().int().min(1).max(10_000_000_000),
        booked_on: day.optional().describe("Default: today"),
        description: z.string().trim().min(1).max(300),
        category: z.string().max(100).optional(),
        sphere: z.enum(SPHERES).optional(),
        counterparty: z.string().max(200).optional(),
        contact_id: uuid.optional(),
        document_id: uuid.optional(),
      })
      .strict(),
    response: Entry,
    status: 201,
    async handler({ db, orgId, body }) {
      await accountOf(db, orgId, body.account_id)
      const r = readEntry({ direction: body.direction, amount: (body.amount_cents / 100).toFixed(2), booked_on: body.booked_on ?? berlinToday(), description: body.description, category: body.category, sphere: body.sphere, counterparty: body.counterparty })
      if ("error" in r) fail({ error: r.error })
      const res = await bookEntry(db, orgId, body.account_id, r.row, { contactId: body.contact_id, documentId: body.document_id })
      if ("error" in res) fail(res)
      const { data } = await db.from("cash_entries").select(ENTRY_COLS).eq("id", res.id).single()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/cash-entries/{id}/reverse",
    permission: "cashbook.manage",
    tag: TAG,
    summary: "Reverse an entry",
    description: "Books the opposite amount today with `reverses_id`. Each entry once; a reversal can't be reversed.",
    response: Entry,
    status: 201,
    async handler({ db, orgId, params }) {
      const res = await reverseEntry(db, orgId, params.id, berlinToday())
      if ("error" in res) fail(res)
      const { data } = await db.from("cash_entries").select(ENTRY_COLS).eq("id", res.id).single()
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/cash-closings",
    permission: "cashbook.view",
    tag: TAG,
    summary: "List month closings",
    query: z.object({ account_id: uuid.optional() }),
    response: z.object({ data: z.array(Closing) }),
    async handler({ db, orgId, query }) {
      let q = db.from("cash_closings").select("id, account_id, month, balance_cents, counted_cents, note, created_at").eq("org_id", orgId).order("month", { ascending: false }).limit(500)
      if (query.account_id) q = q.eq("account_id", query.account_id)
      const { data } = await q
      return { data: (data ?? []).map((c) => ({ ...c, month: c.month.slice(0, 7) })) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/cash-closings",
    permission: "cashbook.manage",
    tag: TAG,
    summary: "Close a month",
    description: "Only after the month ended. The balance is computed by the database; `counted_cents` = the cash count. Afterwards the month takes no entries.",
    body: z.object({ account_id: uuid, month: z.string().regex(/^\d{4}-\d{2}$/), counted_cents: z.number().int().optional(), note: z.string().max(1000).optional() }).strict(),
    response: Closing,
    status: 201,
    async handler({ db, orgId, body }) {
      await accountOf(db, orgId, body.account_id)
      const res = await closeMonth(db, orgId, body.account_id, body.month, body.counted_cents ?? null, body.note ?? null)
      if ("error" in res) fail(res)
      const { data } = await db.from("cash_closings").select("id, account_id, month, balance_cents, counted_cents, note, created_at").eq("account_id", body.account_id).eq("month", `${body.month}-01`).single()
      return { ...data!, month: body.month }
    },
  }),
]
