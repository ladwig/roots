"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import type { ImportOutcome } from "@/components/csv-import"
import { loadFields, readCustom } from "@/lib/custom-fields"
import { validRangeFormat } from "@/lib/number-ranges"
import { INTERVALS } from "@/members/dues"
import * as members from "@/members/server"
import { compact, CREDITOR_ID, PAYMENT_METHODS, today, type Fail } from "@/members/server"
import { bicValid, ibanValid, moneyCents } from "@/lib/inputs"

const PATH = "/members"
const DUES = "/members/dues"
const SETUP = "/members/settings"
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/

async function manager(path = PATH) {
  const ctx = await requirePerm("members.manage")
  const t = await getT()
  if (!ctx.modules.has("members")) back(path, { error: t("errors.not_allowed") })
  return { ctx, t }
}
const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max) || null
const date = (fd: FormData, key: string) => (DATE.test(String(fd.get(key) ?? "")) ? String(fd.get(key)) : null)
const cents = (fd: FormData, key: string) => moneyCents(String(fd.get(key) ?? "0")) ?? 0
const message = (t: T, f: Fail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error, f.vars))

// ---------- memberships ----------

export async function saveMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36)
  const here = id ? `${PATH}/${id}` : `${PATH}/new`
  const typeId = str(fd, "type_id", 36)
  const startsOn = date(fd, "starts_on")
  if (!typeId || !startsOn) back(here, { error: t("membership.typeAndStartRequired") })
  const input = {
    type_id: typeId,
    starts_on: startsOn,
    ends_on: date(fd, "ends_on"),
    account_holder: str(fd, "account_holder", 70),
    iban: str(fd, "iban", 40),
    bic: str(fd, "bic", 11),
    mandate_signed_on: date(fd, "mandate_signed_on"),
    mandate_ref: str(fd, "mandate_ref", 35),
    note: str(fd, "note", 5000),
    fee_cents: String(fd.get("fee") ?? "").trim() ? cents(fd, "fee") : null, // empty = the type's fee
    fee_interval: INTERVALS.find((i) => i === fd.get("fee_interval")) ?? null,
    payment_method: PAYMENT_METHODS.find((p) => p === fd.get("payment_method")) ?? null,
    fee_free_until: date(fd, "fee_free_until"),
  }
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "memberships"), (k) => String(fd.get(`custom.${k}`) ?? ""))
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const withCustom = { ...input, custom: c.custom }

  if (id) {
    const r = await members.updateMembership(ctx.supabase, ctx.org.id, id, withCustom)
    if ("error" in r) back(here, { error: message(t, r) })
    deliverSoon()
    back(here, { ok: t("membership.saved") })
  }

  // New: existing contact, or a new one from name + email.
  let contactId = str(fd, "contact_id", 36)
  if (!contactId) {
    const first = str(fd, "first_name", 100)
    const last = str(fd, "last_name", 100)
    const email = str(fd, "email", 320)?.toLowerCase() ?? null
    if (!first && !last && !email) back(here, { error: t("membership.personRequired") })
    const { data: c, error } = await ctx.supabase.from("contacts").insert({ org_id: ctx.org.id, first_name: first, last_name: last, email }).select("id").single()
    if (error || !c) back(here, { error: error?.code === "23505" ? t("errors.email_taken") : dbError(t, error) })
    contactId = c.id
  }
  const r = await members.insertMembership(ctx.supabase, ctx.org.id, contactId, withCustom, t)
  if ("error" in r) back(here, { error: message(t, r) })
  deliverSoon()
  back(`${PATH}/${r.id}`, { ok: t("membership.created") })
}

/** Cancel: end on the given date, or the earliest date the notice period allows. */
export async function endMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const here = `${PATH}/${id}`
  const r = await members.endMembership(ctx.supabase, ctx.org.id, id, date(fd, "ends_on"))
  if ("error" in r) back(here, { error: message(t, r) })
  deliverSoon()
  back(here, { ok: t("membership.ended", { date: t.date(r.endsOn) }) })
}

export async function pauseMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const here = `${PATH}/${id}`
  const r = await members.pauseMembership(ctx.supabase, ctx.org.id, id, { from: date(fd, "paused_from"), until: date(fd, "paused_until"), reason: str(fd, "pause_reason", 300) })
  if ("error" in r) back(here, { error: message(t, r) })
  back(here, { ok: t("membership.paused") })
}

export async function resumeMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const here = `${PATH}/${id}`
  const r = await members.resumeMembership(ctx.supabase, ctx.org.id, id)
  if ("error" in r) back(here, { error: message(t, r) })
  back(here, { ok: t("membership.resumed") })
}

/** Lost card: new member code, the old one stops working at the door. */
export async function resetMemberCode(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}/${str(fd, "id", 36) ?? ""}`
  const { error } = await ctx.supabase.rpc("reset_member_code", { p_contact: str(fd, "contact", 36) ?? "" })
  back(here, error ? { error: dbError(t, error) } : { ok: t("membership.cardResetDone") })
}

export async function trashMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.memberships", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("membership.trashed") })
}

export async function restoreMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.memberships", p_id: id })
  back(`${PATH}/${id}`, error ? { error: dbError(t, error) } : { ok: t("membership.restored") })
}

// ---------- types + settings ----------

export async function saveType(fd: FormData) {
  const { ctx, t } = await manager(SETUP)
  const id = str(fd, "id", 36)
  const name = str(fd, "name", 100)
  if (!name) back(SETUP, { error: t("membership.nameRequired") })
  const interval = INTERVALS.find((i) => i === fd.get("interval")) ?? "year"
  const row = {
    name,
    fee_cents: cents(fd, "fee"),
    entry_fee_cents: cents(fd, "entry_fee"),
    interval,
    notice_months: Math.min(24, Math.max(0, Math.floor(Number(fd.get("notice_months")) || 0))),
    active: !fd.has("active") || fd.getAll("active").includes("on"), // new types have no checkbox
    prorate: fd.get("prorate") === "on",
    fee_is_minimum: fd.get("fee_is_minimum") === "on",
  }
  const { error } = id
    ? await ctx.supabase.from("membership_types").update(row).eq("id", id).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("membership_types").insert({ ...row, org_id: ctx.org.id })
  if (error) back(SETUP, { error: dbError(t, error) })
  back(SETUP, { ok: t("membership.typeSaved") })
}

export async function deleteType(fd: FormData) {
  const { ctx, t } = await manager(SETUP)
  const { error } = await ctx.supabase.from("membership_types").delete().eq("id", str(fd, "id", 36) ?? "").eq("org_id", ctx.org.id)
  // Still used by memberships → foreign key violation: deactivate instead.
  if (error) back(SETUP, { error: error.code === "23503" ? t("membership.typeInUse") : dbError(t, error) })
  back(SETUP, { ok: t("membership.typeDeleted") })
}

export async function saveSettings(fd: FormData) {
  const { ctx, t } = await manager(SETUP)
  const iban = compact(str(fd, "iban", 40))
  const bic = compact(str(fd, "bic", 11))
  const creditorId = compact(str(fd, "creditor_id", 35))
  if (iban && !ibanValid(iban)) back(SETUP, { error: t("membership.ibanInvalid") })
  if (bic && !bicValid(bic)) back(SETUP, { error: t("membership.bicInvalid") })
  if (creditorId && !CREDITOR_ID.test(creditorId)) back(SETUP, { error: t("membership.creditorIdInvalid") })
  const { error } = await ctx.supabase.from("member_settings").upsert({
    org_id: ctx.org.id,
    creditor_name: str(fd, "creditor_name", 70),
    creditor_id: creditorId,
    iban,
    bic,
    due_day: Math.min(28, Math.max(1, Math.floor(Number(fd.get("due_day")) || 15))),
  })
  if (error) back(SETUP, { error: dbError(t, error) })
  back(SETUP, { ok: t("membership.settingsSaved") })
}

// ---------- dues ----------

/** Period fees for every membership whose type bills a period starting in [from, to]. Running it twice adds nothing. */
/** Member number range (format + next number), see src/lib/number-ranges.ts. */
export async function saveMemberRange(fd: FormData) {
  const { ctx, t } = await manager(SETUP)
  const here = `${SETUP}#numbers`
  const format = String(fd.get("format") ?? "").trim()
  const next = Math.floor(Number(fd.get("next_number")))
  if (!validRangeFormat(format)) back(here, { error: t("numbers.invalid") })
  if (!(next >= 1 && next < 1e9)) back(here, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase
    .from("number_ranges")
    .upsert({ org_id: ctx.org.id, kind: "member", format, next_number: next, yearly_reset: fd.get("yearly_reset") === "1" }, { onConflict: "org_id,kind" })
  back(here, error ? { error: dbError(t, error) } : { ok: t("membership.settingsSaved") })
}

export async function generateDues(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const r = await members.generateDues(ctx.supabase, ctx.org.id, date(fd, "from") ?? "", date(fd, "to") ?? "")
  back(DUES, "error" in r ? { error: message(t, r) } : { ok: t("membership.duesGenerated", { count: r.count }) })
}

/** One-off levy (Umlage) for all members active on the due date, optionally only those with a tag. */
export async function addLevy(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const r = await members.addLevy(ctx.supabase, ctx.org.id, { description: str(fd, "description", 140), amountCents: cents(fd, "amount"), dueOn: date(fd, "due_on"), tag: str(fd, "tag", 100) })
  back(DUES, "error" in r ? { error: message(t, r) } : { ok: t("membership.duesGenerated", { count: r.count }) })
}

export async function setDueStatus(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const status = (["open", "paid", "cancelled"] as const).find((s) => s === fd.get("status"))
  const back_ = String(fd.get("back") ?? "")
  const to = back_.startsWith("/members") ? back_ : DUES
  if (!status) back(to, { error: t("errors.not_allowed") })
  let update = ctx.supabase
    .from("member_dues")
    .update({ status, paid_on: status === "paid" ? today() : null })
    .eq("id", str(fd, "id", 36) ?? "")
    .eq("org_id", ctx.org.id)
  if (status === "open") update = update.is("run_id", null) // collected by a SEPA run: stays paid (cancel the run instead)
  const { error } = await update
  back(to, error ? { error: dbError(t, error) } : { ok: t("membership.dueUpdated") })
}

// ---------- SEPA ----------

/** Bundle open dues (due by the collection date, member has a mandate) into a run; the file is /members/sepa/<id>. */
export async function createSepaRun(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const r = await members.createSepaRun(ctx.supabase, ctx.org.id, date(fd, "collection_on"))
  if ("error" in r) back(DUES, { error: message(t, r) })
  back(`${DUES}?run=${r.id}`, { ok: t("membership.runCreated", { count: r.count }) })
}

/** After the bank collected: mark the run's dues paid. Cancel: release the dues for a new run. */
export async function setRunStatus(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const id = str(fd, "id", 36) ?? ""
  const status = fd.get("status") === "collected" ? "collected" : "cancelled"
  if (!UUID.test(id)) back(DUES, { error: t("errors.not_allowed") })
  const r = await members.setRunStatus(ctx.supabase, ctx.org.id, id, status)
  back(DUES, "error" in r ? { error: message(t, r) } : { ok: t(status === "collected" ? "membership.runCollected" : "membership.runCancelled") })
}

/** Email every member with overdue open dues (one mail per person, all items listed). Optional: only one due (`id`). */
export async function sendReminders(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const back_ = String(fd.get("back") ?? "")
  const to = back_.startsWith("/members") ? back_ : DUES
  const r = await members.sendReminders(ctx.supabase, ctx.org, str(fd, "id", 36), t)
  if ("error" in r) back(to, { error: message(t, r) })
  back(to, { ok: t("membership.remindersSent", { count: r.people }) + (r.withoutEmail ? ` ${t("membership.remindersNoEmail", { count: r.withoutEmail })}` : "") })
}

// ---------- import ----------

/** CSV import: each row = person + membership (see members.importMembers). */
export async function importMembers(input: { rows: Record<string, string>[]; mode: "skip" | "update" }): Promise<ImportOutcome> {
  const ctx = await requirePerm("members.manage")
  const t = await getT()
  if (!ctx.modules.has("members") || !ctx.can("crm.manage")) return { error: t("errors.not_allowed") }
  const r = await members.importMembers(ctx.supabase, ctx.org.id, input, t)
  if (!("error" in r)) deliverSoon()
  return r
}
