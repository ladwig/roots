// Members logic shared by the App's Server Actions and the API. Takes any Supabase client + the org; the caller has
// checked the permission. Failures come back as message keys (`membership.*`, `errors.*`) or a DB error, so each
// caller words them itself (App: the user's language, API: English codes). `t` is only used for text that ends up
// in data or mails (entry fee description, reminder mails).
import type { SupabaseClient } from "@supabase/supabase-js"
import { contactName, MAX_IMPORT_ROWS } from "@/app/(app)/contacts/fields"
import type { ImportOutcome } from "@/components/csv-import"
import { dbError, type T, type Vars } from "@/i18n/translate"
import { loadFields } from "@/lib/custom-fields"
import { sendOrgEmail } from "@/lib/org-email"
import type { Database } from "@/lib/supabase/types"
import { siteUrl } from "@/lib/url"
import { coversPeriod, earliestEnd, periodFee, periods, type Interval } from "./dues"
import { IMPORT_FIELDS, readMember, type MemberRow } from "./fields"
import { pain008 } from "./sepa"

type Db = SupabaseClient<Database>
/** `missing`: the record doesn't exist in this org. */
export type Fail = { error: string; vars?: Vars; db?: { code?: string; message: string }; missing?: boolean }

export const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/
export const BIC = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/
export const CREDITOR_ID = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/
export const compact = (v: string | null | undefined) => v?.toUpperCase().replace(/\s/g, "") || null
export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const fail = (error: string, extra?: Omit<Fail, "error">): Fail => ({ error, ...extra })
const dbFail = (e: { code?: string; message: string }): Fail => ({ error: "db", db: e })

/** "2027", "Q2 2027", "H1 2027", "03/2027" */
function periodLabel(interval: Interval, start: string) {
  const [y, m] = start.split("-").map(Number)
  if (interval === "quarter") return `Q${Math.ceil(m / 3)} ${y}`
  if (interval === "half_year") return `H${m <= 6 ? 1 : 2} ${y}`
  if (interval === "month") return `${String(m).padStart(2, "0")}/${y}`
  return String(y)
}

// ---------- memberships ----------

export type MembershipInput = {
  type_id: string
  starts_on: string
  ends_on: string | null
  account_holder: string | null
  iban: string | null
  bic: string | null
  mandate_signed_on: string | null
  mandate_ref: string | null
  note: string | null
}

function membershipRow(m: MembershipInput) {
  const iban = compact(m.iban)
  const bic = compact(m.bic)
  if (iban && !IBAN.test(iban)) return fail("membership.ibanInvalid")
  if (bic && !BIC.test(bic)) return fail("membership.bicInvalid")
  return {
    row: {
      type_id: m.type_id,
      starts_on: m.starts_on,
      ends_on: m.ends_on,
      account_holder: m.account_holder,
      iban,
      bic,
      mandate_signed_on: iban ? (m.mandate_signed_on ?? m.starts_on) : null,
      note: m.note,
    },
  }
}

/** New membership for an existing contact (+ the type's entry fee as a due). */
export async function insertMembership(db: Db, orgId: string, contactId: string, input: MembershipInput, t: T): Promise<Fail | { id: string }> {
  const r = membershipRow(input)
  if ("error" in r) return r
  const { data: m, error } = await db
    .from("memberships")
    .insert({ org_id: orgId, contact_id: contactId, ...r.row, mandate_ref: r.row.iban ? input.mandate_ref : null })
    .select("id, types:membership_types(name, entry_fee_cents)")
    .single()
  if (error || !m) return dbFail(error ?? { message: "insert failed" })
  if (m.types && m.types.entry_fee_cents > 0)
    await db.from("member_dues").insert({
      org_id: orgId,
      membership_id: m.id,
      kind: "entry",
      description: t("membership.entryFeeText", { type: m.types.name }).slice(0, 140),
      amount_cents: m.types.entry_fee_cents,
      due_on: input.starts_on,
    })
  return { id: m.id }
}

export async function updateMembership(db: Db, orgId: string, id: string, input: MembershipInput): Promise<Fail | { id: string }> {
  const r = membershipRow(input)
  if ("error" in r) return r
  // Mandate reference: as entered, else the existing one, else derived from the member number (like the insert trigger).
  const { data: cur } = await db.from("memberships").select("number, mandate_ref").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!cur) return fail("errors.not_allowed", { missing: true })
  const ref = input.mandate_ref ?? cur.mandate_ref ?? `M${String(cur.number ?? 0).padStart(6, "0")}`
  const { error } = await db
    .from("memberships")
    .update({ ...r.row, mandate_ref: r.row.iban ? ref : null })
    .eq("id", id)
    .eq("org_id", orgId)
  return error ? dbFail(error) : { id }
}

/** Cancel: end on the given date, or the earliest date the notice period allows (never before the start). */
export async function endMembership(db: Db, orgId: string, id: string, endsOn: string | null): Promise<Fail | { endsOn: string }> {
  const { data: m } = await db.from("memberships").select("starts_on, types:membership_types(interval, notice_months)").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!m?.types) return fail("errors.not_allowed", { missing: true })
  let end = endsOn ?? earliestEnd(today(), m.types.notice_months, m.types.interval as Interval)
  if (end < m.starts_on) end = m.starts_on
  const { error } = await db.from("memberships").update({ ends_on: end }).eq("id", id).eq("org_id", orgId)
  return error ? dbFail(error) : { endsOn: end }
}

// ---------- dues ----------

/** Period fees for every membership whose type bills a period starting in [from, to]. Running it twice adds nothing. */
export async function generateDues(db: Db, orgId: string, from: string, to: string): Promise<Fail | { count: number }> {
  if (!from || !to || to < from || to > `${Number(from.slice(0, 4)) + 2}${from.slice(4)}`) return fail("membership.rangeInvalid")
  const [{ data: members }, { data: settings }] = await Promise.all([
    db
      .from("memberships")
      .select("id, starts_on, ends_on, types:membership_types(name, fee_cents, interval, prorate)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .lte("starts_on", to)
      .or(`ends_on.is.null,ends_on.gte.${from}`),
    db.from("member_settings").select("due_day").eq("org_id", orgId).maybeSingle(),
  ])
  const dueDay = String(settings?.due_day ?? 15).padStart(2, "0")
  const wanted = (members ?? []).flatMap((m) =>
    !m.types || m.types.fee_cents <= 0
      ? []
      : periods(m.types.interval as Interval, from, to)
          .filter((p) => coversPeriod(m, p))
          .map((p) => ({
            org_id: orgId,
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
    ? await db.from("member_dues").select("membership_id, period_start").eq("org_id", orgId).eq("kind", "fee").gte("period_start", from).lte("period_start", to)
    : { data: [] }
  const have = new Set(existing?.map((d) => `${d.membership_id}:${d.period_start}`))
  const rows = wanted.filter((r) => !have.has(`${r.membership_id}:${r.period_start}`))
  if (rows.length) {
    const { error } = await db.from("member_dues").insert(rows)
    if (error) return dbFail(error)
  }
  return { count: rows.length }
}

/** One-off levy (Umlage) for all members active on the due date, optionally only those with a tag. */
export async function addLevy(db: Db, orgId: string, l: { description: string | null; amountCents: number; dueOn: string | null; tag: string | null }): Promise<Fail | { count: number }> {
  const { description, amountCents, dueOn, tag } = l
  if (!description || !amountCents || !dueOn) return fail("membership.levyInvalid")
  let q = db
    .from("memberships")
    .select("id, contacts!inner(tags)")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .lte("starts_on", dueOn)
    .or(`ends_on.is.null,ends_on.gte.${dueOn}`)
  if (tag) q = q.contains("contacts.tags", [tag])
  const { data: members } = await q
  const rows = (members ?? []).map((m) => ({ org_id: orgId, membership_id: m.id, kind: "levy" as const, description, amount_cents: amountCents, due_on: dueOn }))
  if (rows.length) {
    const { error } = await db.from("member_dues").insert(rows)
    if (error) return dbFail(error)
  }
  return { count: rows.length }
}

/** Email every member with overdue open dues (one mail per person, all items listed). Optional: only one due. */
export async function sendReminders(db: Db, org: { id: string; name: string; slug: string }, only: string | null, t: T): Promise<Fail | { people: number; withoutEmail: number }> {
  let q = db
    .from("member_dues")
    .select("id, description, amount_cents, due_on, reminders, memberships!inner(member_no, contacts(first_name, last_name, company, email))")
    .eq("org_id", org.id)
    .eq("status", "open")
    .is("run_id", null)
    .lt("due_on", today())
    .limit(5000)
  if (only) q = q.eq("id", only)
  const [{ data: dues }, { data: settings }] = await Promise.all([q, db.from("member_settings").select("creditor_name, iban").eq("org_id", org.id).maybeSingle()])
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
    const pay = settings?.iban ? t("membership.reminderPay", { name: settings.creditor_name ?? org.name, iban: settings.iban, ref: items[0].memberships!.member_no ?? "" }) : ""
    const text = [t("membership.reminderHello", { name }), "", t("membership.reminderIntro", { org: org.name }), "", ...lines, "", t("membership.reminderTotal", { total: t.money(total) }), pay, t("membership.reminderPortal", { url: siteUrl(org.slug, "/portal") }), "", t("membership.reminderBye", { org: org.name })].filter((l, i, a) => l || a[i - 1]).join("\n")
    const html = text.split("\n").map((l) => (l ? `<p style="margin:0 0 4px">${l.replace(/[<>&]/g, (x) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[x]!)}</p>` : "<br>")).join("")
    if (await sendOrgEmail(org.id, { to: email, subject: t("membership.reminderSubject", { org: org.name }), text, html })) sent.push(...items.map((d) => d.id))
  }
  // ponytail: reminder count bumped per batch of ids with a read-modify-write; fine for one treasurer clicking.
  for (const d of (dues ?? []).filter((x) => sent.includes(x.id)))
    await db.from("member_dues").update({ reminded_at: new Date().toISOString(), reminders: d.reminders + 1 }).eq("id", d.id).eq("org_id", org.id)
  if (!dues?.length) return fail("membership.nothingOverdue")
  if (!sent.length) return fail("membership.remindersFailed")
  return { people: byEmail.size, withoutEmail: dues.filter((d) => !d.memberships?.contacts?.email).length }
}

// ---------- SEPA ----------

/** Bundle open dues (due by the collection date, member has a mandate) into a run. */
export async function createSepaRun(db: Db, orgId: string, collectionOn: string | null): Promise<Fail | { id: string; count: number }> {
  if (!collectionOn || collectionOn <= today()) return fail("membership.collectionDateInvalid")
  const { data: settings } = await db.from("member_settings").select("creditor_name, creditor_id, iban").eq("org_id", orgId).maybeSingle()
  if (!settings?.creditor_id || !settings.iban || !settings.creditor_name) return fail("membership.creditorMissing")
  const { data: dues } = await db
    .from("member_dues")
    .select("id, amount_cents, memberships!inner(iban, mandate_signed_on)")
    .eq("org_id", orgId)
    .eq("status", "open")
    .is("run_id", null)
    .lte("due_on", collectionOn)
    .not("memberships.iban", "is", null)
    .not("memberships.mandate_signed_on", "is", null)
    .limit(5000)
  if (!dues?.length) return fail("membership.nothingToCollect")
  const { data: run, error } = await db
    .from("sepa_runs")
    .insert({ org_id: orgId, collection_on: collectionOn, count: dues.length, total_cents: dues.reduce((s, d) => s + d.amount_cents, 0) })
    .select("id")
    .single()
  if (error || !run) return dbFail(error ?? { message: "insert failed" })
  const { error: linkError } = await db.from("member_dues").update({ run_id: run.id }).in("id", dues.map((d) => d.id)).eq("org_id", orgId)
  if (linkError) return dbFail(linkError)
  return { id: run.id, count: dues.length }
}

/** After the bank collected: mark the run's dues paid. Cancel: release the dues for a new run. Only exported runs. */
export async function setRunStatus(db: Db, orgId: string, id: string, status: "collected" | "cancelled"): Promise<Fail | { status: string }> {
  const { data: run } = await db.from("sepa_runs").select("collection_on, status").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!run) return fail("errors.not_allowed", { missing: true })
  if (run.status !== "exported") return fail("errors.not_allowed")
  const { error } =
    status === "collected"
      ? await db.from("member_dues").update({ status: "paid", paid_on: run.collection_on }).eq("run_id", id).eq("org_id", orgId).eq("status", "open")
      : await db.from("member_dues").update({ run_id: null }).eq("run_id", id).eq("org_id", orgId).eq("status", "open")
  if (error) return dbFail(error)
  await db.from("sepa_runs").update({ status }).eq("id", id).eq("org_id", orgId)
  return { status }
}

/** The run's direct debits as pain.008 XML (for upload to online banking), or null if the run or creditor data is missing. */
export async function sepaXml(db: Db, org: { id: string; name: string }, runId: string) {
  const [{ data: run }, { data: settings }, { data: dues }] = await Promise.all([
    db.from("sepa_runs").select("message_id, collection_on, created_at").eq("id", runId).eq("org_id", org.id).maybeSingle(),
    db.from("member_settings").select("creditor_name, creditor_id, iban, bic").eq("org_id", org.id).maybeSingle(),
    db
      .from("member_dues")
      .select("id, description, amount_cents, memberships(number, account_holder, iban, bic, mandate_ref, mandate_signed_on, contacts(first_name, last_name, company, email))")
      .eq("run_id", runId)
      .eq("org_id", org.id),
  ])
  if (!run || !settings?.creditor_id || !settings.iban) return null
  const xml = pain008({
    messageId: run.message_id,
    createdAt: new Date(run.created_at),
    collectionOn: run.collection_on,
    creditor: { name: settings.creditor_name ?? org.name, iban: settings.iban, bic: settings.bic, creditorId: settings.creditor_id },
    debits: (dues ?? [])
      .filter((d) => d.memberships?.iban && d.memberships.mandate_ref && d.memberships.mandate_signed_on)
      .map((d) => {
        const m = d.memberships!
        return {
          id: d.id,
          name: m.account_holder || (m.contacts ? contactName(m.contacts) : ""),
          iban: m.iban!,
          bic: m.bic,
          mandateRef: m.mandate_ref!,
          mandateDate: m.mandate_signed_on!,
          amountCents: d.amount_cents,
          text: `${d.description} Nr. ${m.number ?? ""}`,
        }
      }),
  })
  return { xml, filename: `sepa-${run.collection_on}.xml` }
}

// ---------- import ----------

/** CSV import: each row = person + membership. Existing contacts (by email) are reused; a contact that already has
 * a live membership is skipped, or its membership updated in "update" mode. No entry fees for imported members.
 * Rows come mapped ({ "<field>" | "custom.<key>": text }) and are validated here; messages in `t`'s language. */
export async function importMembers(db: Db, orgId: string, input: { rows: Record<string, string>[]; mode: "skip" | "update" }, t: T): Promise<ImportOutcome> {
  if (!Array.isArray(input?.rows) || input.rows.length > MAX_IMPORT_ROWS) return { error: t("errors.invalid_input") }
  const allowed = new Set(IMPORT_FIELDS.map((f) => f.key))
  const [defs, { data: types }] = await Promise.all([loadFields(db, orgId, "contacts"), db.from("membership_types").select("id, name").eq("org_id", orgId)])
  defs.forEach((d) => allowed.add(`custom.${d.key}`))
  const mapped = new Set(Object.keys(input.rows[0] ?? {}))
  const checkDefs = defs.map((d) => ({ ...d, required: d.required && mapped.has(`custom.${d.key}`) }))
  const now = today()

  const errors: { line: number; message: string }[] = []
  const valid: { line: number; row: MemberRow }[] = []
  const seen = new Set<string>()
  let skipped = 0
  input.rows.forEach((raw, i) => {
    const line = i + 2
    const r = readMember((k) => (allowed.has(k) && typeof raw?.[k] === "string" ? raw[k] : ""), types ?? [], checkDefs, now)
    if ("error" in r) return void errors.push({ line, message: (r.field ? `${r.field}: ` : "") + t.dynamic(r.error) })
    const email = r.row.contact.email
    if (email && seen.has(email)) return void skipped++
    if (email) seen.add(email)
    valid.push({ line, row: r.row })
  })

  // Existing contacts (by email) and their live memberships.
  const emails = valid.flatMap((v) => (v.row.contact.email ? [v.row.contact.email] : []))
  const contactIds = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await db.from("contacts").select("id, email").eq("org_id", orgId).is("deleted_at", null).in("email", emails.slice(i, i + 500))
    data?.forEach((c) => contactIds.set(c.email!, c.id))
  }
  const ids = [...contactIds.values()]
  const memberOf = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("memberships").select("id, contact_id").eq("org_id", orgId).is("deleted_at", null).in("contact_id", ids.slice(i, i + 500))
    data?.forEach((m) => memberOf.set(m.contact_id, m.id))
  }

  // New contacts in one insert (returned in input order); line → new contact id.
  const created = new Map<number, string>()
  const newContacts = valid.filter((v) => !v.row.contact.email || !contactIds.has(v.row.contact.email))
  if (newContacts.length) {
    const { data, error } = await db
      .from("contacts")
      .insert(newContacts.map((v) => ({ ...v.row.contact, custom: v.row.contact.custom as never, org_id: orgId })))
      .select("id")
    if (error || !data) return { error: dbError(t, error) }
    newContacts.forEach((v, i) => created.set(v.line, data[i].id))
  }
  const contactOf = (v: (typeof valid)[number]) => created.get(v.line) ?? contactIds.get(v.row.contact.email!)!

  const inserts = valid.filter((v) => !memberOf.has(contactOf(v)))
  const existing = valid.filter((v) => memberOf.has(contactOf(v)))
  let inserted = 0
  if (inserts.length) {
    const { error } = await db.from("memberships").insert(inserts.map((v) => ({ ...v.row.membership, org_id: orgId, contact_id: contactOf(v) })))
    if (error) return { error: dbError(t, error) }
    inserted = inserts.length
  }
  let updated = 0
  if (input.mode === "update") {
    for (const v of existing) {
      // The number stays as it is (the old system's number only counts for new members).
      const m: Partial<MemberRow["membership"]> = { ...v.row.membership }
      delete m.number
      delete m.member_no
      const { error } = await db.from("memberships").update(m).eq("id", memberOf.get(contactOf(v))!).eq("org_id", orgId)
      if (error) errors.push({ line: v.line, message: dbError(t, error) })
      else updated++
    }
  } else skipped += existing.length
  return { inserted, updated, skipped, errors: errors.sort((a, b) => a.line - b.line) }
}
