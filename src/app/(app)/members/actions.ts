"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { sendOrgEmail } from "@/lib/org-email"
import { coversPeriod, earliestEnd, INTERVALS, periodFee, periods, type Interval } from "@/members/dues"

const PATH = "/members"
const DUES = "/members/dues"
const SETUP = "/members/setup"
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

async function manager(path = PATH) {
  const ctx = await requirePerm("members.manage")
  const t = await getT()
  if (!ctx.modules.has("members")) back(path, { error: t("errors.not_allowed") })
  return { ctx, t }
}
const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max) || null
const date = (fd: FormData, key: string) => (DATE.test(String(fd.get(key) ?? "")) ? String(fd.get(key)) : null)
const cents = (fd: FormData, key: string) => Math.round(Math.max(0, Number(String(fd.get(key) ?? "0").replace(",", ".")) || 0) * 100)
const compact = (v: string | null) => v?.toUpperCase().replace(/\s/g, "") || null

/** "2027", "Q2 2027", "H1 2027", "03/2027" */
function periodLabel(interval: Interval, start: string) {
  const [y, m] = start.split("-").map(Number)
  if (interval === "quarter") return `Q${Math.ceil(m / 3)} ${y}`
  if (interval === "half_year") return `H${m <= 6 ? 1 : 2} ${y}`
  if (interval === "month") return `${String(m).padStart(2, "0")}/${y}`
  return String(y)
}

// ---------- memberships ----------

export async function saveMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36)
  const here = id ? `${PATH}?edit=${id}` : `${PATH}?new=1`
  const typeId = str(fd, "type_id", 36)
  const startsOn = date(fd, "starts_on")
  const iban = compact(str(fd, "iban", 40))
  const bic = compact(str(fd, "bic", 11))
  if (!typeId || !startsOn) back(here, { error: t("membership.typeAndStartRequired") })
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) back(here, { error: t("membership.ibanInvalid") })
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) back(here, { error: t("membership.bicInvalid") })
  const fields = {
    type_id: typeId,
    starts_on: startsOn,
    ends_on: date(fd, "ends_on"),
    account_holder: str(fd, "account_holder", 70),
    iban,
    bic,
    mandate_signed_on: iban ? (date(fd, "mandate_signed_on") ?? startsOn) : null,
    note: str(fd, "note", 5000),
  }

  if (id) {
    // Mandate reference: as entered, else the existing one, else derived from the member number (like the insert trigger).
    const { data: cur } = await ctx.supabase.from("memberships").select("number, mandate_ref").eq("id", id).eq("org_id", ctx.org.id).single()
    const ref = str(fd, "mandate_ref", 35) ?? cur?.mandate_ref ?? `M${String(cur?.number ?? 0).padStart(6, "0")}`
    const { error } = await ctx.supabase
      .from("memberships")
      .update({ ...fields, mandate_ref: iban ? ref : null })
      .eq("id", id)
      .eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
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
  const { data: m, error } = await ctx.supabase
    .from("memberships")
    .insert({ org_id: ctx.org.id, contact_id: contactId, ...fields, mandate_ref: iban ? str(fd, "mandate_ref", 35) : null })
    .select("id, types:membership_types(name, entry_fee_cents)")
    .single()
  if (error || !m) back(here, { error: dbError(t, error) })
  if (m.types && m.types.entry_fee_cents > 0)
    await ctx.supabase.from("member_dues").insert({
      org_id: ctx.org.id,
      membership_id: m.id,
      kind: "entry",
      description: t("membership.entryFeeText", { type: m.types.name }).slice(0, 140),
      amount_cents: m.types.entry_fee_cents,
      due_on: startsOn,
    })
  deliverSoon()
  back(`${PATH}?edit=${m.id}`, { ok: t("membership.created") })
}

/** Cancel: end on the given date, or the earliest date the notice period allows. */
export async function endMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const here = `${PATH}?edit=${id}`
  const { data: m } = await ctx.supabase.from("memberships").select("starts_on, types:membership_types(interval, notice_months)").eq("id", id).eq("org_id", ctx.org.id).single()
  if (!m?.types) back(here, { error: t("errors.not_allowed") })
  let endsOn = date(fd, "ends_on") ?? earliestEnd(today(), m.types.notice_months, m.types.interval as Interval)
  if (endsOn < m.starts_on) endsOn = m.starts_on
  const { error } = await ctx.supabase.from("memberships").update({ ends_on: endsOn }).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  deliverSoon()
  back(here, { ok: t("membership.ended", { date: t.date(endsOn) }) })
}

export async function trashMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.memberships", p_id: id })
  if (error) back(`${PATH}?edit=${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("membership.trashed") })
}

export async function restoreMembership(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.memberships", p_id: id })
  back(`${PATH}?edit=${id}`, error ? { error: dbError(t, error) } : { ok: t("membership.restored") })
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
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) back(SETUP, { error: t("membership.ibanInvalid") })
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) back(SETUP, { error: t("membership.bicInvalid") })
  if (creditorId && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(creditorId)) back(SETUP, { error: t("membership.creditorIdInvalid") })
  const numberFormat = str(fd, "number_format", 40) ?? "{N}"
  if (!/\{N+\}/.test(numberFormat)) back(SETUP, { error: t("membership.numberFormatInvalid") })
  const { error } = await ctx.supabase.from("member_settings").upsert({
    org_id: ctx.org.id,
    number_format: numberFormat,
    number_start: Math.max(1, Math.floor(Number(fd.get("number_start")) || 1)),
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
export async function generateDues(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const from = date(fd, "from")
  const to = date(fd, "to")
  if (!from || !to || to < from || to > `${Number(from.slice(0, 4)) + 2}${from.slice(4)}`) back(DUES, { error: t("membership.rangeInvalid") })
  const [{ data: members }, { data: settings }] = await Promise.all([
    ctx.supabase
      .from("memberships")
      .select("id, starts_on, ends_on, types:membership_types(name, fee_cents, interval, prorate)")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .lte("starts_on", to)
      .or(`ends_on.is.null,ends_on.gte.${from}`),
    ctx.supabase.from("member_settings").select("due_day").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  const dueDay = String(settings?.due_day ?? 15).padStart(2, "0")
  const wanted = (members ?? []).flatMap((m) =>
    !m.types || m.types.fee_cents <= 0
      ? []
      : periods(m.types.interval as Interval, from, to)
          .filter((p) => coversPeriod(m, p))
          .map((p) => ({
            org_id: ctx.org.id,
            membership_id: m.id,
            kind: "fee" as const,
            description: `${m.types!.name} ${periodLabel(m.types!.interval as Interval, p.start)}`.slice(0, 140),
            amount_cents: periodFee(m.types!.fee_cents, m.types!.interval as Interval, p, m, m.types!.prorate),
            period_start: p.start,
            due_on: `${p.start.slice(0, 8)}${dueDay}`,
          }))
          .filter((r) => r.amount_cents > 0),
  )
  // ponytail: existing check per run over ≤ a few thousand rows; chunk the .in() if a Verein has more members.
  const { data: existing } = wanted.length
    ? await ctx.supabase.from("member_dues").select("membership_id, period_start").eq("org_id", ctx.org.id).eq("kind", "fee").gte("period_start", from).lte("period_start", to)
    : { data: [] }
  const have = new Set(existing?.map((d) => `${d.membership_id}:${d.period_start}`))
  const rows = wanted.filter((r) => !have.has(`${r.membership_id}:${r.period_start}`))
  if (rows.length) {
    const { error } = await ctx.supabase.from("member_dues").insert(rows)
    if (error) back(DUES, { error: dbError(t, error) })
  }
  back(DUES, { ok: t("membership.duesGenerated", { count: rows.length }) })
}

/** One-off levy (Umlage) for all members active on the due date, optionally only those with a tag. */
export async function addLevy(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const description = str(fd, "description", 140)
  const amount = cents(fd, "amount")
  const dueOn = date(fd, "due_on")
  const tag = str(fd, "tag", 100)
  if (!description || !amount || !dueOn) back(DUES, { error: t("membership.levyInvalid") })
  let q = ctx.supabase
    .from("memberships")
    .select("id, contacts!inner(tags)")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .lte("starts_on", dueOn)
    .or(`ends_on.is.null,ends_on.gte.${dueOn}`)
  if (tag) q = q.contains("contacts.tags", [tag])
  const { data: members } = await q
  const rows = (members ?? []).map((m) => ({ org_id: ctx.org.id, membership_id: m.id, kind: "levy" as const, description, amount_cents: amount, due_on: dueOn }))
  if (rows.length) {
    const { error } = await ctx.supabase.from("member_dues").insert(rows)
    if (error) back(DUES, { error: dbError(t, error) })
  }
  back(DUES, { ok: t("membership.duesGenerated", { count: rows.length }) })
}

export async function setDueStatus(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const status = (["open", "paid", "cancelled"] as const).find((s) => s === fd.get("status"))
  const back_ = String(fd.get("back") ?? "")
  const to = back_.startsWith("/members") ? back_ : DUES
  if (!status) back(to, { error: t("errors.not_allowed") })
  const { error } = await ctx.supabase
    .from("member_dues")
    .update({ status, paid_on: status === "paid" ? today() : null })
    .eq("id", str(fd, "id", 36) ?? "")
    .eq("org_id", ctx.org.id)
  back(to, error ? { error: dbError(t, error) } : { ok: t("membership.dueUpdated") })
}

// ---------- SEPA ----------

/** Bundle open dues (due by the collection date, member has a mandate) into a run; the file is /members/sepa/<id>. */
export async function createSepaRun(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const collectionOn = date(fd, "collection_on")
  if (!collectionOn || collectionOn <= today()) back(DUES, { error: t("membership.collectionDateInvalid") })
  const { data: settings } = await ctx.supabase.from("member_settings").select("creditor_name, creditor_id, iban").eq("org_id", ctx.org.id).maybeSingle()
  if (!settings?.creditor_id || !settings.iban || !settings.creditor_name) back(DUES, { error: t("membership.creditorMissing") })
  const { data: dues } = await ctx.supabase
    .from("member_dues")
    .select("id, amount_cents, memberships!inner(iban, mandate_signed_on)")
    .eq("org_id", ctx.org.id)
    .eq("status", "open")
    .is("run_id", null)
    .lte("due_on", collectionOn)
    .not("memberships.iban", "is", null)
    .not("memberships.mandate_signed_on", "is", null)
    .limit(5000)
  if (!dues?.length) back(DUES, { error: t("membership.nothingToCollect") })
  const { data: run, error } = await ctx.supabase
    .from("sepa_runs")
    .insert({ org_id: ctx.org.id, collection_on: collectionOn, count: dues.length, total_cents: dues.reduce((s, d) => s + d.amount_cents, 0) })
    .select("id")
    .single()
  if (error || !run) back(DUES, { error: dbError(t, error) })
  const { error: linkError } = await ctx.supabase.from("member_dues").update({ run_id: run.id }).in("id", dues.map((d) => d.id)).eq("org_id", ctx.org.id)
  if (linkError) back(DUES, { error: dbError(t, linkError) })
  back(`${DUES}?run=${run.id}`, { ok: t("membership.runCreated", { count: dues.length }) })
}

/** After the bank collected: mark the run's dues paid. Cancel: release the dues for a new run. */
export async function setRunStatus(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const id = str(fd, "id", 36) ?? ""
  const status = fd.get("status") === "collected" ? "collected" : "cancelled"
  if (!UUID.test(id)) back(DUES, { error: t("errors.not_allowed") })
  const { data: run } = await ctx.supabase.from("sepa_runs").select("collection_on, status").eq("id", id).eq("org_id", ctx.org.id).single()
  if (!run || run.status !== "exported") back(DUES, { error: t("errors.not_allowed") })
  const { error } =
    status === "collected"
      ? await ctx.supabase.from("member_dues").update({ status: "paid", paid_on: run.collection_on }).eq("run_id", id).eq("org_id", ctx.org.id).eq("status", "open")
      : await ctx.supabase.from("member_dues").update({ run_id: null }).eq("run_id", id).eq("org_id", ctx.org.id).eq("status", "open")
  if (error) back(DUES, { error: dbError(t, error) })
  await ctx.supabase.from("sepa_runs").update({ status }).eq("id", id).eq("org_id", ctx.org.id)
  back(DUES, { ok: t(status === "collected" ? "membership.runCollected" : "membership.runCancelled") })
}

/** Email every member with overdue open dues (one mail per person, all items listed). Optional: only one due (`id`). */
export async function sendReminders(fd: FormData) {
  const { ctx, t } = await manager(DUES)
  const only = str(fd, "id", 36)
  const back_ = String(fd.get("back") ?? "")
  const to = back_.startsWith("/members") ? back_ : DUES
  let q = ctx.supabase
    .from("member_dues")
    .select("id, description, amount_cents, due_on, reminders, memberships!inner(member_no, contacts(first_name, last_name, company, email))")
    .eq("org_id", ctx.org.id)
    .eq("status", "open")
    .is("run_id", null)
    .lt("due_on", today())
    .limit(5000)
  if (only) q = q.eq("id", only)
  const [{ data: dues }, { data: settings }] = await Promise.all([q, ctx.supabase.from("member_settings").select("creditor_name, iban").eq("org_id", ctx.org.id).maybeSingle()])
  const byEmail = new Map<string, NonNullable<typeof dues>>()
  for (const d of dues ?? []) {
    const email = d.memberships?.contacts?.email
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), d])
  }
  const sent: string[] = []
  for (const [email, items] of byEmail) {
    const c = items[0].memberships!.contacts!
    const name = c.first_name || c.company || ""
    const total = items.reduce((s, d) => s + d.amount_cents, 0)
    const lines = items.map((d) => `• ${d.description} (${t.date(d.due_on)}): ${t.money(d.amount_cents)}`)
    const pay = settings?.iban ? t("membership.reminderPay", { name: settings.creditor_name ?? ctx.org.name, iban: settings.iban, ref: items[0].memberships!.member_no ?? "" }) : ""
    const text = [t("membership.reminderHello", { name }), "", t("membership.reminderIntro", { org: ctx.org.name }), "", ...lines, "", t("membership.reminderTotal", { total: t.money(total) }), pay, "", t("membership.reminderBye", { org: ctx.org.name })].filter((l, i, a) => l || a[i - 1]).join("\n")
    const html = text.split("\n").map((l) => (l ? `<p style="margin:0 0 4px">${l.replace(/[<>&]/g, (x) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[x]!)}</p>` : "<br>")).join("")
    if (await sendOrgEmail(ctx.org.id, { to: email, subject: t("membership.reminderSubject", { org: ctx.org.name }), text, html })) sent.push(...items.map((d) => d.id))
  }
  // ponytail: reminder count bumped per batch of ids with a read-modify-write; fine for one treasurer clicking.
  for (const d of (dues ?? []).filter((x) => sent.includes(x.id)))
    await ctx.supabase.from("member_dues").update({ reminded_at: new Date().toISOString(), reminders: d.reminders + 1 }).eq("id", d.id).eq("org_id", ctx.org.id)
  const skipped = (dues ?? []).filter((d) => !d.memberships?.contacts?.email).length
  if (!dues?.length) back(to, { error: t("membership.nothingOverdue") })
  back(to, sent.length ? { ok: t("membership.remindersSent", { count: byEmail.size }) + (skipped ? ` ${t("membership.remindersNoEmail", { count: skipped })}` : "") } : { error: t("membership.remindersFailed") })
}
