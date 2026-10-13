"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { ACCOUNT_KINDS, cents, readEntry } from "@/cashbook/fields"
import { bookEntry, closeMonth, reverseEntry, type CashFail } from "@/cashbook/server"

const PATH = "/cashbook"
const UUID = /^[0-9a-f-]{36}$/

async function manager() {
  const ctx = await requirePerm("cashbook.manage")
  const t = await getT()
  if (!ctx.modules.has("cashbook")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim()
const id = (fd: FormData, key: string) => (UUID.test(str(fd, key)) ? str(fd, key) : null)
const message = (t: T, f: CashFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const at = (account: string, month?: string) => `${PATH}?account=${account}${month ? `&month=${month}` : ""}`

export async function saveAccount(fd: FormData) {
  const { ctx, t } = await manager()
  const accountId = id(fd, "id")
  const here = accountId ? `${PATH}?edit_account=${accountId}` : `${PATH}?new=account`
  const name = str(fd, "name").slice(0, 100)
  const opening = str(fd, "opening") ? cents(str(fd, "opening").replace(/^-/, "")) : 0
  if (!name || opening === null) back(here, { error: t("errors.invalid_input") })
  const row = {
    name,
    kind: ACCOUNT_KINDS.find((k) => k === fd.get("kind")) ?? "cash",
    opening_cents: str(fd, "opening").startsWith("-") ? -opening! : opening!,
    opening_on: /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "opening_on")) ? str(fd, "opening_on") : today(),
    active: !accountId || fd.get("active") === "on",
  }
  const { data, error } = accountId
    ? await ctx.supabase.from("cash_accounts").update(row).eq("id", accountId).eq("org_id", ctx.org.id).select("id").single()
    : await ctx.supabase.from("cash_accounts").insert({ ...row, org_id: ctx.org.id }).select("id").single()
  if (error || !data) back(here, { error: dbError(t, error) })
  back(at(data!.id), { ok: t("cashbook.accountSaved") })
}

export async function bookCashEntry(fd: FormData) {
  const { ctx, t } = await manager()
  const account = id(fd, "account_id") ?? ""
  const here = `${at(account)}&new=entry`
  const r = readEntry({ direction: str(fd, "direction"), amount: str(fd, "amount"), booked_on: str(fd, "booked_on"), description: str(fd, "description"), category: str(fd, "category"), sphere: str(fd, "sphere"), counterparty: str(fd, "counterparty") })
  if ("error" in r) back(here, { error: t.dynamic(r.error) })
  const res = await bookEntry(ctx.supabase, ctx.org.id, account, r.row, { documentId: id(fd, "document_id") })
  if ("error" in res) back(here, { error: message(t, res) })
  deliverSoon()
  back(`${at(account, r.row.booked_on.slice(0, 7))}&edit=${res.id}`, { ok: t("cashbook.booked", { number: res.number }) })
}

export async function reverseCashEntry(fd: FormData) {
  const { ctx, t } = await manager()
  const entry = id(fd, "id") ?? ""
  const account = id(fd, "account_id") ?? ""
  const res = await reverseEntry(ctx.supabase, ctx.org.id, entry, today())
  if ("error" in res) back(`${at(account)}&edit=${entry}`, { error: message(t, res) })
  back(`${at(account, today().slice(0, 7))}&edit=${res.id}`, { ok: t("cashbook.reversed", { number: res.number }) })
}

export async function closeCashMonth(fd: FormData) {
  const { ctx, t } = await manager()
  const account = id(fd, "account_id") ?? ""
  const month = str(fd, "month")
  const counted = str(fd, "counted") ? cents(str(fd, "counted")) : null
  if (str(fd, "counted") && counted === null) back(at(account, month), { error: t("cashbook.amountInvalid") })
  const res = await closeMonth(ctx.supabase, ctx.org.id, account, month, counted, str(fd, "note").slice(0, 1000) || null)
  back(at(account, month), "error" in res ? { error: message(t, res) } : { ok: t("cashbook.closed") })
}
