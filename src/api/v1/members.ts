import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import * as members from "@/members/server"
import { isPaused } from "@/members/dues"
import { memberDoor } from "@/members/door"
import { BIC, compact, CREDITOR_ID, IBAN, type Fail } from "@/members/server"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ImportResult, trashRow } from "./contacts"
import { berlinToday, day, ts, type Db } from "./shared"

const en = createT("en", messages.en) // API messages
const de = createT("de", messages.de) // text that ends up in data or mails (German first, like the org's public pages)

// Shared members logic fails with message keys ("membership.rangeInvalid") → code "range_invalid" + English text.
function fail(f: Fail): never {
  if (f.missing) throw notFound()
  if (f.db?.message === "not_allowed") throw new ApiError(422, "invalid_reference", "A referenced id (contact, type) does not belong to this organisation.")
  if (f.db) throw dbError(f.db)
  const code = f.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  throw new ApiError(422, code, en.dynamic(f.error, f.vars))
}
const Ok = z.object({ ok: z.literal(true) })

const Interval = z.enum(["month", "quarter", "half_year", "year", "none"])
const MembershipType = z.object({
  id: uuid,
  name: z.string(),
  fee: z.number().int().describe("Fee per interval in cents"),
  interval: Interval,
  entry_fee: z.number().int().describe("One-off entry fee in cents"),
  notice_months: z.number().int(),
  prorate: z.boolean(),
  active: z.boolean(),
})
const TYPE_COLS = "id, name, fee:fee_cents, interval, entry_fee:entry_fee_cents, notice_months, prorate, active"
const TypeInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    fee: z.number().int().min(0).max(100_000_000).describe("Fee per interval in cents"),
    interval: Interval,
    entry_fee: z.number().int().min(0).max(100_000_000).describe("One-off entry fee in cents, billed when a membership starts"),
    notice_months: z.number().int().min(0).max(24),
    prorate: z.boolean().describe("Bill partial periods pro rata when joining/leaving mid-period"),
    active: z.boolean().describe("Inactive types can't be chosen for new members"),
  })
  .partial()
  .strict()
const typeRow = (b: z.infer<typeof TypeInput>) => ({
  ...(b.name !== undefined && { name: b.name }),
  ...(b.fee !== undefined && { fee_cents: b.fee }),
  ...(b.interval !== undefined && { interval: b.interval }),
  ...(b.entry_fee !== undefined && { entry_fee_cents: b.entry_fee }),
  ...(b.notice_months !== undefined && { notice_months: b.notice_months }),
  ...(b.prorate !== undefined && { prorate: b.prorate }),
  ...(b.active !== undefined && { active: b.active }),
})

const maskIban = (iban: string | null) => (iban ? `${iban.slice(0, 4)}…${iban.slice(-4)}` : null)
const Settings = z.object({
  number_format: z.string().describe("Member number format, {N} / {NNNN} = the number (zero-padded)"),
  number_start: z.number().int().describe("First member number"),
  creditor_name: z.string().nullable().describe("SEPA creditor name"),
  creditor_id: z.string().nullable().describe("SEPA creditor identifier (Gläubiger-ID)"),
  iban: z.string().nullable().describe("Masked (first 4 and last 4 characters)"),
  bic: z.string().nullable(),
  due_day: z.number().int().describe("Day of month fees are due (1–28)"),
})
const SETTINGS_DEFAULTS = { number_format: "{N}", number_start: 1, creditor_name: null, creditor_id: null, iban: null, bic: null, due_day: 15 }

const Membership = z.object({
  id: uuid,
  member_no: z.string().nullable().describe("Formatted member number"),
  contact_id: uuid,
  type_id: uuid,
  starts_on: day,
  ends_on: day.nullable(),
  paused_from: day.nullable().describe("Pause start; no fees for periods fully inside the pause"),
  paused_until: day.nullable().describe("Pause end (null with paused_from = until resumed)"),
  pause_reason: z.string().nullable(),
  paused: z.boolean().describe("Paused today"),
  active: z.boolean().describe("Started and not ended (today)"),
  has_mandate: z.boolean().describe("SEPA direct debit mandate on file (bank details are not exposed)"),
  mandate_ref: z.string().nullable(),
  note: z.string().nullable(),
  created_at: ts,
  updated_at: ts,
})
const MEMBERSHIP_COLS = "id, member_no, contact_id, type_id, starts_on, ends_on, paused_from, paused_until, pause_reason, iban, mandate_ref, note, created_at, updated_at"
type MembershipRow = { iban: string | null; starts_on: string; ends_on: string | null; paused_from: string | null; paused_until: string | null } & Record<string, unknown>
const membershipOut = ({ iban, ...m }: MembershipRow) => {
  const now = berlinToday()
  delete m.contacts // only joined for the search filter
  return { ...m, has_mandate: !!iban, paused: isPaused(m, now), active: m.starts_on <= now && (!m.ends_on || m.ends_on >= now) }
}
async function getMembership(db: Db, orgId: string, id: string) {
  const { data } = await db.from("memberships").select(MEMBERSHIP_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return membershipOut(data)
}
const Bank = {
  account_holder: z.string().trim().max(70).nullable(),
  iban: z.string().max(40).nullable().describe("SEPA direct debit mandate: IBAN (spaces allowed). null removes the mandate"),
  bic: z.string().max(11).nullable(),
  mandate_signed_on: day.nullable().describe("Date the mandate was signed (default: start date)"),
  mandate_ref: z.string().max(35).nullable().describe("Mandate reference (default: derived from the member number)"),
  note: z.string().max(5000).nullable(),
}

const Due = z.object({
  id: uuid,
  membership_id: uuid,
  kind: z.enum(["fee", "entry", "levy"]),
  description: z.string(),
  amount: z.number().int().describe("Cents"),
  period_start: day.nullable(),
  due_on: day,
  status: z.enum(["open", "paid", "cancelled"]),
  paid_on: day.nullable(),
  run_id: uuid.nullable().describe("SEPA run the due is collected in"),
  reminders: z.number().int().describe("Payment reminders sent"),
  reminded_at: ts.nullable(),
  updated_at: ts,
})
const DUE_COLS = "id, membership_id, kind, description, amount:amount_cents, period_start, due_on, status, paid_on, run_id, reminders, reminded_at, updated_at"

const SepaRun = z.object({
  id: uuid,
  collection_on: day.describe("Collection date at the bank"),
  count: z.number().int().describe("Number of direct debits"),
  total: z.number().int().describe("Cents"),
  status: z.enum(["exported", "collected", "cancelled"]),
  created_at: ts,
})
const RUN_COLS = "id, collection_on, count, total:total_cents, status, created_at"
async function getRun(db: Db, orgId: string, id: string) {
  const { data } = await db.from("sepa_runs").select(RUN_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return data
}

export const endpoints: Endpoint[] = [
  // ---------- types + settings ----------
  endpoint({
    method: "GET",
    path: "/membership-types",
    permission: "members.view",
    tag: "Members",
    summary: "List membership types",
    response: z.object({ data: z.array(MembershipType) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("membership_types").select(TYPE_COLS).eq("org_id", orgId).order("name")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/membership-types",
    permission: "members.manage",
    tag: "Members",
    summary: "Create a membership type",
    body: TypeInput.required({ name: true }),
    response: MembershipType,
    status: 201,
    async handler({ db, orgId, body }) {
      const { data, error } = await db
        .from("membership_types")
        .insert({ interval: "year", ...typeRow(body), name: body.name, org_id: orgId })
        .select(TYPE_COLS)
        .single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/membership-types/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Change a membership type",
    description: "Only the given fields change. Existing dues keep their amounts.",
    body: TypeInput,
    response: MembershipType,
    async handler({ db, orgId, params, body }) {
      const { data, error } = await db.from("membership_types").update(typeRow(body)).eq("id", params.id).eq("org_id", orgId).select(TYPE_COLS).maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/membership-types/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Delete a membership type",
    description: "Only types no membership uses (409 `type_in_use` otherwise: deactivate it instead).",
    response: Ok,
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("membership_types").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error?.code === "23503") throw new ApiError(409, "type_in_use", en("membership.typeInUse"))
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "GET",
    path: "/member-settings",
    permission: "members.manage",
    tag: "Members",
    summary: "Member numbers and SEPA creditor settings",
    response: Settings,
    async handler({ db, orgId }) {
      const { data } = await db.from("member_settings").select("number_format, number_start, creditor_name, creditor_id, iban, bic, due_day").eq("org_id", orgId).maybeSingle()
      const s = data ?? SETTINGS_DEFAULTS
      return { ...s, iban: maskIban(s.iban) }
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/member-settings",
    permission: "members.manage",
    tag: "Members",
    summary: "Change member settings",
    description: "Only the given fields change; null clears an optional field.",
    body: z
      .object({
        number_format: z.string().max(40).regex(/\{N+\}/, "Must contain {N}"),
        number_start: z.number().int().min(1).max(1_000_000_000),
        creditor_name: z.string().trim().max(70).nullable(),
        creditor_id: z.string().max(35).nullable(),
        iban: z.string().max(40).nullable(),
        bic: z.string().max(11).nullable(),
        due_day: z.number().int().min(1).max(28),
      })
      .partial()
      .strict(),
    response: Settings,
    async handler({ db, orgId, body }) {
      const { data: cur } = await db.from("member_settings").select("number_format, number_start, creditor_name, creditor_id, iban, bic, due_day").eq("org_id", orgId).maybeSingle()
      const next = { ...SETTINGS_DEFAULTS, ...cur, ...body }
      const row = { ...next, creditor_name: next.creditor_name || null, iban: compact(next.iban), bic: compact(next.bic), creditor_id: compact(next.creditor_id) }
      if (row.iban && !IBAN.test(row.iban)) throw new ApiError(422, "iban_invalid", en("membership.ibanInvalid"))
      if (row.bic && !BIC.test(row.bic)) throw new ApiError(422, "bic_invalid", en("membership.bicInvalid"))
      if (row.creditor_id && !CREDITOR_ID.test(row.creditor_id)) throw new ApiError(422, "creditor_id_invalid", en("membership.creditorIdInvalid"))
      const { error } = await db.from("member_settings").upsert({ ...row, org_id: orgId }, { onConflict: "org_id" })
      if (error) throw dbError(error)
      return { ...row, iban: maskIban(row.iban) }
    },
  }),

  // ---------- memberships ----------
  endpoint({
    method: "GET",
    path: "/members",
    permission: "members.view",
    tag: "Members",
    summary: "List memberships",
    query: page.extend({
      status: z.enum(["active", "ended", "all"]).default("all"),
      q: z.string().max(100).optional().describe("Search in the member's name, company, email"),
      contact_id: uuid.optional(),
      type_id: uuid.optional(),
      updated_since: z.iso.datetime({ offset: true }).optional(),
    }),
    response: list(Membership),
    async handler({ db, orgId, query }) {
      const now = berlinToday()
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      let q = db
        .from("memberships")
        .select(s ? `${MEMBERSHIP_COLS}, contacts!inner(id)` : MEMBERSHIP_COLS)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("number")
        .range(query.offset, query.offset + query.limit)
      if (query.status === "active") q = q.lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`)
      if (query.status === "ended") q = q.lt("ends_on", now)
      if (query.contact_id) q = q.eq("contact_id", query.contact_id)
      if (query.type_id) q = q.eq("type_id", query.type_id)
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      if (s) q = q.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${s}%`).join(","), { referencedTable: "contacts" })
      const { data } = await q
      return paged(((data ?? []) as unknown as MembershipRow[]).map(membershipOut), query)
    },
  }),
  // Before /members/{id}: the dispatcher takes the first matching path.
  endpoint({
    method: "GET",
    path: "/members/trash",
    permission: "members.manage",
    tag: "Members",
    summary: "List deleted memberships",
    description: "Memberships in the trash (restorable for 30 days, then purged). Newest deletion first.",
    query: page,
    response: list(Membership.extend({ deleted_at: ts })),
    async handler({ db, orgId, query }) {
      const { data } = await db
        .from("memberships")
        .select(`${MEMBERSHIP_COLS}, deleted_at`)
        .eq("org_id", orgId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(query.offset, query.offset + query.limit)
      return paged(data?.map(membershipOut) ?? [], query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/members/import",
    permission: "members.manage",
    tag: "Members",
    summary: "Import members in bulk",
    description:
      'Same rules as the CSV import in the app. One row = a person + their membership: contact fields as in POST /contacts/import, plus "membership.type" (type name; optional with one type), "membership.starts_on", "membership.ends_on", "membership.number", "membership.account_holder", "membership.iban", "membership.bic", "membership.mandate_ref", "membership.mandate_signed_on". Existing contacts (by email) are reused; a contact with a membership is skipped (mode skip) or its membership updated (mode update). No entry fees. Also needs `crm.manage`.',
    body: z
      .object({
        rows: z.array(z.record(z.string().max(100), z.string().max(5000))).min(1).max(5000),
        mode: z.enum(["skip", "update"]).default("skip"),
      })
      .strict(),
    response: ImportResult,
    async handler({ db, orgId, body }) {
      const { data: crm } = await db.rpc("has_perm", { p_org: orgId, p_perm: "crm.manage" })
      if (!crm) throw new ApiError(403, "forbidden", 'This key lacks the permission "crm.manage".')
      const r = await members.importMembers(db, orgId, body, en)
      if ("error" in r) throw new ApiError(422, "import_failed", r.error)
      deliverSoon()
      return r
    },
  }),
  endpoint({
    method: "GET",
    path: "/members/{id}",
    permission: "members.view",
    tag: "Members",
    summary: "Get a membership",
    response: Membership,
    handler: ({ db, orgId, params }) => getMembership(db, orgId, params.id),
  }),
  endpoint({
    method: "POST",
    path: "/members",
    permission: "members.manage",
    tag: "Members",
    summary: "Add a member",
    description:
      "For an existing contact (create it with POST /contacts first). The member number is assigned automatically; the type's entry fee becomes a due. Emits `membership.started`.",
    body: z
      .object({ contact_id: uuid, type_id: uuid, starts_on: day.optional().describe("Default: today"), ends_on: day.nullable().optional(), ...z.object(Bank).partial().shape })
      .strict(),
    response: Membership,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await members.insertMembership(
        db,
        orgId,
        body.contact_id,
        {
          type_id: body.type_id,
          starts_on: body.starts_on ?? berlinToday(),
          ends_on: body.ends_on ?? null,
          account_holder: body.account_holder || null,
          iban: body.iban ?? null,
          bic: body.bic ?? null,
          mandate_signed_on: body.mandate_signed_on ?? null,
          mandate_ref: body.mandate_ref || null,
          note: body.note ?? null,
        },
        de,
      )
      if ("error" in r) fail(r)
      deliverSoon()
      return getMembership(db, orgId, r.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/members/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Change a membership",
    description: "Only the given fields change. To cancel with the notice period use POST /members/{id}/end; `ends_on` here sets the end directly.",
    body: z
      .object({ type_id: uuid, starts_on: day, ends_on: day.nullable(), ...Bank })
      .partial()
      .strict(),
    response: Membership,
    async handler({ db, orgId, params, body }) {
      const { data: cur } = await db
        .from("memberships")
        .select("type_id, starts_on, ends_on, account_holder, iban, bic, mandate_signed_on, mandate_ref, note")
        .eq("id", params.id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle()
      if (!cur) throw notFound()
      const r = await members.updateMembership(db, orgId, params.id, { ...cur, ...body, account_holder: (body.account_holder ?? cur.account_holder) || null, mandate_ref: body.mandate_ref === undefined ? cur.mandate_ref : body.mandate_ref || null })
      if ("error" in r) fail(r)
      deliverSoon()
      return getMembership(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/members/{id}/end",
    permission: "members.manage",
    tag: "Members",
    summary: "Cancel a membership",
    description: "Ends it on `ends_on`, or (without) on the earliest date the type's notice period allows. Never before the start. Emits `membership.ended`.",
    body: z.object({ ends_on: day.optional() }).strict(),
    response: Membership,
    async handler({ db, orgId, params, body }) {
      await getMembership(db, orgId, params.id)
      const r = await members.endMembership(db, orgId, params.id, body.ends_on ?? null)
      if ("error" in r) fail(r)
      deliverSoon()
      return getMembership(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/members/{id}/pause",
    permission: "members.manage",
    tag: "Members",
    summary: "Pause a membership",
    description: "Pauses from `paused_from` (default today) until `paused_until` (omit = until resumed). No fees for periods fully inside the pause; the end date doesn't move. Replaces an existing pause.",
    body: z.object({ paused_from: day.optional(), paused_until: day.optional(), pause_reason: z.string().max(300).optional() }).strict(),
    response: Membership,
    async handler({ db, orgId, params, body }) {
      await getMembership(db, orgId, params.id)
      const r = await members.pauseMembership(db, orgId, params.id, { from: body.paused_from ?? null, until: body.paused_until ?? null, reason: body.pause_reason?.trim() || null })
      if ("error" in r) fail(r)
      return getMembership(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/members/{id}/resume",
    permission: "members.manage",
    tag: "Members",
    summary: "End a pause",
    description: "A pause that hasn't started is removed; a running one ends yesterday.",
    response: Membership,
    async handler({ db, orgId, params }) {
      await getMembership(db, orgId, params.id)
      const r = await members.resumeMembership(db, orgId, params.id)
      if ("error" in r) fail(r)
      return getMembership(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/events/{id}/member-check-in",
    permission: "tickets.scan",
    tag: "Members",
    summary: "Member check-in at the door",
    description:
      "Find a member by `code` (the 12-character member card code) or `contact_id`. Without `admit` it only looks them up (`member`). With `admit: true` they are let in: a used, free ticket of the event's member ticket type (counts against capacity), event `membership.checked_in`. Results: `ok`, `member`, `already` (in since `checked_in_at`), `full`, `not_member`, `invalid`. Needs the members and tickets modules.",
    body: z.object({ code: z.string().max(40).optional(), contact_id: uuid.optional(), admit: z.boolean().optional() }).strict(),
    response: z.object({
      result: z.enum(["invalid", "not_member", "member", "ok", "already", "full"]),
      contact_id: uuid.optional(),
      name: z.string().nullable().optional(),
      membership_id: uuid.nullable().optional(),
      member_no: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      state: z.enum(["none", "upcoming", "ended", "active"]).optional(),
      ends_on: day.nullable().optional(),
      paused: z.boolean().optional(),
      paused_until: day.nullable().optional(),
      overdue_count: z.number().int().optional(),
      overdue_cents: z.number().int().optional(),
      visits: z.number().int().optional().describe("Member check-ins so far (all events)"),
      last_visit: ts.nullable().optional(),
      checked_in_at: ts.nullable().optional(),
    }),
    async handler({ db, orgId, params, body }) {
      const { data: ev } = await db.from("events").select("id").eq("id", params.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!ev) throw notFound()
      if (!body.code && !body.contact_id) throw new ApiError(400, "invalid_input", "Send `code` or `contact_id`.")
      try {
        const code = body.code?.toUpperCase().replace(/[^A-Z0-9]/g, "")
        return await memberDoor(db, params.id, { code, contactId: body.contact_id }, body.admit ?? false)
      } catch (e) {
        throw dbError(e as { message: string; code?: string })
      }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/members/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Delete a membership (to the trash)",
    description: "Soft delete, restorable for 30 days. Its dues stay. To end a membership use POST /members/{id}/end.",
    response: Ok,
    async handler({ db, params }) {
      await trashRow(db, "public.memberships", params.id)
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/members/{id}/restore",
    permission: "members.manage",
    tag: "Members",
    summary: "Restore a deleted membership",
    response: Membership,
    async handler({ db, orgId, params }) {
      await trashRow(db, "public.memberships", params.id, true)
      return getMembership(db, orgId, params.id)
    },
  }),

  // ---------- dues ----------
  endpoint({
    method: "GET",
    path: "/dues",
    permission: "members.view",
    tag: "Members",
    summary: "List member dues",
    query: page.extend({
      status: z.enum(["open", "paid", "cancelled"]).optional(),
      membership_id: uuid.optional(),
      run_id: uuid.optional(),
      overdue: z.enum(["true", "false"]).optional().describe("true: open and due before today"),
      updated_since: z.iso.datetime({ offset: true }).optional(),
    }),
    response: list(Due),
    async handler({ db, orgId, query }) {
      let q = db.from("member_dues").select(DUE_COLS).eq("org_id", orgId).order("due_on").range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      if (query.membership_id) q = q.eq("membership_id", query.membership_id)
      if (query.run_id) q = q.eq("run_id", query.run_id)
      if (query.overdue === "true") q = q.eq("status", "open").lt("due_on", berlinToday())
      if (query.updated_since) q = q.gte("updated_at", query.updated_since)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/dues/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Mark a due paid, cancelled or open",
    description: "For bank or accounting sync. `paid_on` defaults to today. Dues are never deleted.",
    body: z.object({ status: z.enum(["open", "paid", "cancelled"]), paid_on: day.optional() }).strict(),
    response: Due,
    async handler({ db, orgId, params, body }) {
      const { data, error } = await db
        .from("member_dues")
        .update({ status: body.status, paid_on: body.status === "paid" ? (body.paid_on ?? berlinToday()) : null })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(DUE_COLS)
        .maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/dues/generate",
    permission: "members.manage",
    tag: "Members",
    summary: "Generate membership fees for a date range",
    description:
      "Creates the fee due for every membership whose type bills a period starting between `from` and `to` (at most 2 years), pro rata where the type says so. Running it twice adds nothing.",
    body: z.object({ from: day, to: day }).strict(),
    response: z.object({ created: z.number().int() }),
    async handler({ db, orgId, body }) {
      const r = await members.generateDues(db, orgId, body.from, body.to)
      if ("error" in r) fail(r)
      return { created: r.count }
    },
  }),
  endpoint({
    method: "POST",
    path: "/dues/levy",
    permission: "members.manage",
    tag: "Members",
    summary: "Add a one-off levy",
    description: "One due for every membership active on `due_on`, optionally only members whose contact has `tag`.",
    body: z
      .object({
        description: z.string().trim().min(1).max(140),
        amount: z.number().int().min(1).max(100_000_000).describe("Cents"),
        due_on: day,
        tag: z.string().max(100).optional(),
      })
      .strict(),
    response: z.object({ created: z.number().int() }),
    async handler({ db, orgId, body }) {
      const r = await members.addLevy(db, orgId, { description: body.description, amountCents: body.amount, dueOn: body.due_on, tag: body.tag || null })
      if ("error" in r) fail(r)
      return { created: r.count }
    },
  }),
  endpoint({
    method: "POST",
    path: "/dues/reminders",
    permission: "members.manage",
    tag: "Members",
    summary: "Send payment reminders",
    description:
      "Emails every member with overdue open dues (not in a SEPA run): one mail per person listing all items, in German, from the organisation's email setup. With `due_id` only for that due. 422 `nothing_overdue` if there is nothing to remind.",
    body: z.object({ due_id: uuid.optional() }).strict(),
    response: z.object({ people: z.number().int().describe("Members emailed"), without_email: z.number().int().describe("Overdue dues skipped because the contact has no email") }),
    async handler({ db, orgId, body }) {
      const { data: org } = await db.from("orgs").select("id, name, slug").eq("id", orgId).single()
      if (!org) throw notFound()
      const r = await members.sendReminders(db, org, body.due_id ?? null, de)
      if ("error" in r) fail(r)
      return { people: r.people, without_email: r.withoutEmail }
    },
  }),

  // ---------- SEPA ----------
  endpoint({
    method: "GET",
    path: "/sepa-runs",
    permission: "members.view",
    tag: "Members",
    summary: "List SEPA direct debit runs",
    description: "Newest first.",
    query: page,
    response: list(SepaRun),
    async handler({ db, orgId, query }) {
      const { data } = await db.from("sepa_runs").select(RUN_COLS).eq("org_id", orgId).order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      return paged(data, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/sepa-runs",
    permission: "members.manage",
    tag: "Members",
    summary: "Create a SEPA direct debit run",
    description:
      "Bundles all open dues that are due by `collection_on` (a future date) of members with a mandate. Needs the creditor settings (GET/PATCH /member-settings). Then download the file (GET /sepa-runs/{id}/xml), upload it to online banking and mark the run collected.",
    body: z.object({ collection_on: day }).strict(),
    response: SepaRun,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = await members.createSepaRun(db, orgId, body.collection_on)
      if ("error" in r) fail(r)
      return getRun(db, orgId, r.id)
    },
  }),
  endpoint({
    method: "GET",
    path: "/sepa-runs/{id}",
    permission: "members.view",
    tag: "Members",
    summary: "Get a SEPA run",
    description: "Its dues: GET /dues?run_id=…",
    response: SepaRun,
    handler: ({ db, orgId, params }) => getRun(db, orgId, params.id),
  }),
  endpoint({
    method: "GET",
    path: "/sepa-runs/{id}/xml",
    permission: "members.manage",
    tag: "Members",
    summary: "SEPA file of a run (pain.008)",
    description: "The direct debits as pain.008.001.08 XML for upload to online banking. Contains the members' bank details.",
    response: z.object({ filename: z.string(), xml: z.string() }),
    async handler({ db, orgId, params }) {
      const { data: org } = await db.from("orgs").select("id, name").eq("id", orgId).single()
      const file = org && (await members.sepaXml(db, org, params.id))
      if (!file) throw notFound()
      return file
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/sepa-runs/{id}",
    permission: "members.manage",
    tag: "Members",
    summary: "Mark a SEPA run collected or cancel it",
    description: "collected: the run's open dues become paid (on the collection date). cancelled: its open dues are released for a new run. Only for runs in status exported.",
    body: z.object({ status: z.enum(["collected", "cancelled"]) }).strict(),
    response: SepaRun,
    async handler({ db, orgId, params, body }) {
      const r = await members.setRunStatus(db, orgId, params.id, body.status)
      if ("error" in r) {
        if (!r.missing && !r.db) throw new ApiError(409, "run_closed", "Only runs in status exported can change.")
        fail(r)
      }
      return getRun(db, orgId, params.id)
    },
  }),
]
