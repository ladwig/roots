// The platform's object catalog: every kind of record a workflow can start from, look at or change — its table,
// module, fields (with the kind of value), which fields may be changed, and its relations to other objects.
// Workflows use it for triggers ("Ticket created", "Membership changed"), the pickers (object → field → value),
// loading a run's data (the record + everything one relation away) and the generic "change record" action.
// New table with business data = one entry here (objects.test.mjs fails for audited tables that are missing).
// Pure: the editor, the worker and the tests share it.
import type { OPS } from "./graph"

export type Kind = "text" | "number" | "date" | "bool" | "tags" | "ref" | "enum"
export type RefList = "events" | "membership_types" | "forms" | "courses" | "guest_lists" | "tags"
// write = "change record" may set it (validated by kind; refs must exist in the org).
export type Field = { key: string; kind: Kind; ref?: RefList; refTable?: string; options?: string[]; write?: true; time?: true } // time: a timestamp (date + time)
export type ObjectDef = {
  table: string
  module: string // shown only when the org has it on ("org" = always)
  idKey?: string // payload key of module events that carries its id
  fields: Field[]
  relations?: Record<string, string> // column → object key (loaded with the record, one hop)
  record?: true // can start workflows when created / changed / deleted
  // "create record": the fields that can be set, and links to objects of the run (e.g. the person) set automatically
  create?: { fields: string[]; parents?: Record<string, string> } // column → object key
}

const text = (key: string, write?: true): Field => ({ key, kind: "text", ...(write ? { write } : {}) })
const date = (key: string, write?: true): Field => ({ key, kind: "date", ...(write ? { write } : {}) })
const at = (key: string, write?: true): Field => ({ key, kind: "date", time: true, ...(write ? { write } : {}) }) // timestamp
const refTo = (key: string, ref: RefList, refTable: string): Field => ({ key, kind: "ref", ref, refTable })
const num = (key: string, write?: true): Field => ({ key, kind: "number", ...(write ? { write } : {}) })
const bool = (key: string, write?: true): Field => ({ key, kind: "bool", ...(write ? { write } : {}) })
const pick = (key: string, options: string[], write?: true): Field => ({ key, kind: "enum", options, ...(write ? { write } : {}) })

export const OBJECTS = {
  contact: {
    table: "contacts",
    module: "crm",
    idKey: "contact_id",
    record: true,
    fields: [
      text("first_name", true),
      text("last_name", true),
      text("company", true),
      text("email"),
      text("phone", true),
      text("city", true),
      text("country", true),
      date("birthday", true),
      { key: "tags", kind: "tags", ref: "tags" },
      date("unsubscribed_at"),
    ],
    create: { fields: ["first_name", "last_name", "company", "email", "phone", "city", "country", "birthday"] },
  },
  note: { table: "contact_notes", module: "crm", record: true, fields: [text("body")], relations: { contact_id: "contact" }, create: { fields: ["body"], parents: { contact_id: "contact" } } },
  membership: {
    table: "memberships",
    module: "members",
    idKey: "membership_id",
    record: true,
    fields: [{ key: "type_id", kind: "ref", ref: "membership_types", refTable: "membership_types", write: true }, text("member_no"), date("starts_on"), date("ends_on", true), text("note", true)],
    relations: { contact_id: "contact", type_id: "membership_type" },
    create: { fields: ["type_id", "starts_on", "ends_on", "note"], parents: { contact_id: "contact" } },
  },
  membership_type: { table: "membership_types", module: "members", fields: [text("name"), num("fee_cents"), pick("interval", ["month", "quarter", "half_year", "year", "none"])] },
  due: {
    table: "member_dues",
    module: "members",
    record: true,
    fields: [pick("kind", ["fee", "entry", "levy"]), text("description"), num("amount_cents"), date("due_on"), pick("status", ["open", "paid", "cancelled"], true), date("paid_on"), num("reminders")],
    relations: { membership_id: "membership" },
  },
  event: {
    table: "events",
    module: "events",
    idKey: "event_id",
    record: true,
    fields: [{ key: "id", kind: "ref", ref: "events" }, text("title"), pick("status", ["draft", "published", "cancelled"]), at("starts_at"), at("ends_at"), text("venue_name"), num("capacity")],
    create: { fields: ["title", "starts_at", "ends_at", "venue_name", "capacity"] }, // created as a draft
  },
  slot: {
    table: "event_slots",
    module: "events",
    record: true,
    fields: [refTo("event_id", "events", "events"), text("title"), text("stage"), at("starts_at"), at("ends_at")],
    relations: { event_id: "event", artist_id: "artist" },
    create: { fields: ["event_id", "title", "stage", "starts_at", "ends_at"] },
  },
  artist: { table: "artists", module: "events", record: true, fields: [text("name")], relations: { contact_id: "contact" }, create: { fields: ["name"] } },
  ticket: {
    table: "tickets",
    module: "tickets",
    record: true,
    fields: [text("code"), pick("status", ["reserved", "valid", "used", "void"]), text("holder_name"), num("price"), at("checked_in_at")],
    relations: { event_id: "event", order_id: "order", contact_id: "contact", type_id: "ticket_type" },
  },
  ticket_type: { table: "ticket_types", module: "tickets", record: true, fields: [text("name"), num("price"), num("quota"), bool("active", true), bool("hidden", true)], relations: { event_id: "event" } },
  tickets: { table: "tickets", module: "tickets", idKey: "order_id", fields: [{ key: "types", kind: "tags" }, num("count")] }, // the tickets of an order (ticket sold)
  waitlist_entry: {
    table: "event_waitlist",
    module: "tickets",
    record: true,
    fields: [text("name"), text("email"), num("quantity"), pick("status", ["waiting", "offered", "claimed", "expired", "cancelled"])],
    relations: { event_id: "event" },
  },
  order: {
    table: "pay_orders",
    module: "payments",
    idKey: "order_id",
    fields: [num("amount_total"), pick("status", ["open", "paid", "cancelled", "refunded"]), pick("source_module", ["tickets", "members", "invoices"]), text("customer_email"), text("customer_name")],
  },
  guest_list: { table: "guest_lists", module: "guestlists", idKey: "list_id", record: true, fields: [{ key: "id", kind: "ref", ref: "guest_lists" }, text("name")], relations: { event_id: "event" } },
  guest: {
    table: "guest_entries",
    module: "guestlists",
    record: true,
    fields: [{ key: "list_id", kind: "ref", ref: "guest_lists", refTable: "guest_lists" }, text("name"), text("email"), text("note", true), text("added_via")],
    relations: { list_id: "guest_list" },
    create: { fields: ["list_id", "name", "email", "note"] },
  },
  guest_checkin: { table: "guest_checkins", module: "guestlists", record: true, fields: [date("checked_in_at")], relations: { entry_id: "guest", event_id: "event" } },
  shift: {
    table: "shifts",
    module: "shifts",
    idKey: "shift_id",
    record: true,
    fields: [refTo("event_id", "events", "events"), text("title"), at("starts_at"), at("ends_at"), num("needed"), bool("open", true)],
    relations: { event_id: "event" },
    create: { fields: ["title", "starts_at", "ends_at", "needed", "event_id"] },
  },
  shift_assignment: { table: "shift_assignments", module: "shifts", record: true, fields: [pick("status", ["assigned", "applied"])], relations: { shift_id: "shift", staff_id: "staff" } },
  staff: { table: "staff", module: "shifts", record: true, fields: [text("name"), text("email"), text("role_label", true), num("target_hours", true), bool("active", true)], relations: { contact_id: "contact" } },
  time_entry: {
    table: "time_entries",
    module: "shifts",
    record: true,
    fields: [at("started_at"), at("ended_at"), num("break_minutes"), date("approved_at"), text("note")],
    relations: { staff_id: "staff", shift_id: "shift" },
    create: { fields: ["started_at", "ended_at", "note"], parents: { staff_id: "staff" } },
  },
  employee: {
    table: "employees",
    module: "hr",
    record: true,
    fields: [
      text("name"),
      text("email"),
      text("job_title", true),
      text("department", true),
      pick("employment_type", ["full_time", "part_time", "minijob", "working_student", "trainee", "freelance", "volunteer", "other"]),
      date("starts_on"),
      date("ends_on", true),
    ],
    relations: { staff_id: "staff" },
  },
  absence: {
    table: "absences",
    module: "hr",
    record: true,
    fields: [pick("kind", ["vacation", "sick", "unpaid", "other"]), date("starts_on"), date("ends_on"), bool("half_day")],
    relations: { employee_id: "employee" },
    create: { fields: ["kind", "starts_on", "ends_on"], parents: { employee_id: "employee" } },
  },
  course: { table: "courses", module: "courses", idKey: "course_id", record: true, fields: [{ key: "id", kind: "ref", ref: "courses" }, text("title"), text("instructor"), num("capacity", true)] },
  course_session: {
    table: "course_sessions",
    module: "courses",
    record: true,
    fields: [refTo("course_id", "courses", "courses"), at("starts_at"), at("ends_at"), bool("cancelled", true), text("note", true)],
    relations: { course_id: "course" },
    create: { fields: ["course_id", "starts_at", "ends_at", "note"] },
  },
  participant: {
    table: "course_participants",
    module: "courses",
    record: true,
    fields: [{ key: "course_id", kind: "ref", ref: "courses", refTable: "courses" }, pick("status", ["enrolled", "waiting", "cancelled"], true), text("note", true)],
    relations: { course_id: "course", contact_id: "contact" },
    create: { fields: ["course_id", "note"], parents: { contact_id: "contact" } },
  },
  attendance: { table: "course_attendance", module: "courses", record: true, fields: [bool("present")], relations: { participant_id: "participant", session_id: "course_session" } },
  form: {
    table: "forms",
    module: "forms",
    idKey: "form_id",
    record: true,
    fields: [{ key: "id", kind: "ref", ref: "forms" }, text("title"), pick("status", ["draft", "published", "closed"]), pick("purpose", ["contact", "membership"])],
  },
  submission: {
    table: "form_submissions",
    module: "forms",
    idKey: "submission_id",
    record: true,
    fields: [pick("status", ["new", "accepted", "rejected"]), text("email")],
    relations: { form_id: "form", contact_id: "contact", membership_id: "membership" },
  },
  invoice: {
    table: "documents",
    module: "invoices",
    idKey: "document_id",
    record: true,
    fields: [
      pick("kind", ["invoice", "quote", "cancellation"]),
      pick("status", ["draft", "sent", "paid", "accepted", "declined", "cancelled"]),
      text("number"),
      num("gross_total"),
      date("issue_date"),
      date("due_date"),
      date("paid_at"),
    ],
    relations: { contact_id: "contact" },
  },
  file: { table: "files", module: "org", record: true, fields: [text("name"), text("mime"), num("size"), text("entity"), text("folder")] },
  now: { table: "", module: "org", fields: [pick("weekday", ["1", "2", "3", "4", "5", "6", "7"]), num("hour"), date("date")] }, // when the step runs (Berlin)
} satisfies Record<string, ObjectDef>
export type ObjectKey = keyof typeof OBJECTS
export const def = (k: ObjectKey): ObjectDef => OBJECTS[k]

// Audited tables that are deliberately not workflow objects (setup, technical, sensitive). Everything else must be
// in OBJECTS – objects.test.mjs checks it, so a new feature's tables show up in workflows.
export const NOT_OBJECTS = [
  "api_keys", "custom_fields", "document_items", "email_automations", "email_campaigns", "employee_private", "event_subscriptions",
  "invites", "letter_templates", "locations", "member_settings", "number_ranges", "org_billing", "org_integrations", "org_members",
  "org_modules", "orgs", "platform_admins", "positions", "roles", "sepa_runs", "shift_series", "site_pages", "sites", "ticket_codes",
  "ticket_tiers", "workflow_runs", "workflows",
]

// ---------- triggers ----------

export const RECORD_ACTIONS = ["insert", "update", "delete"] as const
export type RecordAction = (typeof RECORD_ACTIONS)[number]
/** "record:tickets:insert" ↔ { object: "ticket", action: "insert" } */
export const recordTrigger = (object: ObjectKey, action: RecordAction) => `record:${def(object).table}:${action}`
export const RECORD_OBJECTS = (Object.keys(OBJECTS) as ObjectKey[]).filter((k) => def(k).record)
export function parseRecordTrigger(type: string): { object: ObjectKey; action: RecordAction } | null {
  const m = /^record:([a-z_]+):(insert|update|delete)$/.exec(type)
  const object = m && RECORD_OBJECTS.find((k) => def(k).table === m[1])
  return m && object ? { object, action: m[2] as RecordAction } : null
}

// Which objects module events bring (from their payload ids).
export const EVENT_OBJECTS: Record<string, ObjectKey[]> = {
  "contact.created": ["contact"],
  "tickets.sold": ["contact", "event", "order", "tickets"],
  "order.paid": ["contact", "order"],
  "order.refunded": ["contact", "order"],
  "order.failed": ["contact", "order"],
  "event.published": ["event"],
  "event.updated": ["event"],
  "event.cancelled": ["event"],
  "invoice.issued": ["invoice", "contact"],
  "invoice.paid": ["invoice", "contact"],
  "invoice.cancelled": ["invoice", "contact"],
  "quote.issued": ["invoice", "contact"],
  "quote.accepted": ["invoice", "contact"],
  "guestlist.signed_up": ["guest_list", "contact"],
  "shift.applied": ["shift"],
  "membership.started": ["membership", "contact"],
  "membership.self_updated": ["membership", "contact"],
  "membership.ended": ["membership", "contact"],
  "form.submitted": ["submission", "form", "contact"],
  "course.enrolled": ["course", "contact"],
  "course.moved_up": ["course", "contact"],
}

/**
 * Objects a trigger brings: module events → their list; record triggers → the record + everything one relation
 * away. Plus derived: the person's current membership, and the time. Only objects of active modules.
 */
export function objectsFor(trigger: string, modules?: Set<string>): ObjectKey[] {
  const rec = parseRecordTrigger(trigger)
  const sched = /^schedule(?::([a-z_]+))?$/.exec(trigger)
  const root = rec?.object ?? (sched?.[1] && sched[1] in OBJECTS ? (sched[1] as ObjectKey) : null)
  const base: ObjectKey[] = root ? [root, ...(Object.values(def(root).relations ?? {}) as ObjectKey[])] : sched ? [] : (EVENT_OBJECTS[trigger] ?? ["contact"])
  const all = [...new Set<ObjectKey>([...base, ...(base.includes("contact") && !base.includes("membership") ? (["membership"] as const) : []), "now"])]
  return all.filter((o) => !modules || def(o).module === "org" || modules.has(def(o).module))
}

/** Objects "create record" can create in a run of this trigger (their links must be in the run, e.g. the person). */
export const creatableFor = (trigger: string, modules?: Set<string>) => {
  const have = new Set(objectsFor(trigger, modules))
  return (Object.keys(OBJECTS) as ObjectKey[]).filter((o) => {
    const c = def(o).create
    return c && (!modules || modules.has(def(o).module)) && Object.values(c.parents ?? {}).every((p) => have.has(p as ObjectKey))
  })
}
/** Objects a schedule can run over (one run per record). */
export const SCHEDULE_OBJECTS = (Object.keys(OBJECTS) as ObjectKey[]).filter((o) => def(o).record)

/** Objects "change record" can write in a run of this trigger. */
export const writableFor = (trigger: string, modules?: Set<string>) => objectsFor(trigger, modules).filter((o) => o === "contact" || def(o).fields.some((f) => f.write))

// Comparisons that make sense per kind of value.
export const OPS_FOR: Record<Kind, (typeof OPS)[number][]> = {
  text: ["eq", "neq", "contains", "not_contains", "empty", "not_empty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "empty", "not_empty"],
  date: ["eq", "gt", "gte", "lt", "lte", "empty", "not_empty"],
  bool: ["eq"],
  tags: ["contains", "not_contains", "empty", "not_empty"],
  ref: ["eq", "neq", "empty", "not_empty"],
  enum: ["eq", "neq"],
}

/** "contact.custom.level" → { object: "contact", field: "custom.level" } */
export const splitPath = (path: string) => {
  const i = path.indexOf(".")
  return i < 0 ? { object: path, field: "" } : { object: path.slice(0, i), field: path.slice(i + 1) }
}

/** Only the catalog's fields of a loaded row (plus id and relation columns), so sensitive columns never reach a run. */
export function pickFields(object: ObjectKey, row: Record<string, unknown> | null) {
  if (!row) return null
  const out: Record<string, unknown> = { id: row.id }
  for (const f of def(object).fields) if (f.key in row) out[f.key] = row[f.key]
  for (const col of Object.keys(def(object).relations ?? {})) if (col in row) out[col] = row[col]
  if (object === "contact") out.custom = row.custom ?? {}
  if (object === "submission") out.answers = answers(row.data)
  return out
}

// Form answers of a submission as workflow data: person fields flat, custom fields under custom, the chosen
// membership type/start, accepted consents. Bank details never (IBAN only masked). Which fields an org's forms
// have (for the pickers) is read from the forms themselves (automations/[id]/page.tsx).
export function answers(data: unknown) {
  const d = (data ?? {}) as { contact?: Record<string, unknown>; custom?: Record<string, unknown>; membership?: Record<string, unknown> | null; consents?: { label: string; accepted: boolean }[] }
  const iban = typeof d.membership?.iban === "string" && d.membership.iban ? `${d.membership.iban.slice(0, 4)}…${d.membership.iban.slice(-4)}` : null
  return {
    ...(d.contact ?? {}),
    custom: d.custom ?? {},
    membership: d.membership ? { type_id: d.membership.type_id ?? null, starts_on: d.membership.starts_on ?? null, iban } : null,
    consents: (d.consents ?? []).filter((c) => c.accepted).map((c) => c.label),
  }
}
