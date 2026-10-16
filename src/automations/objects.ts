// The platform's object catalog: every kind of record a workflow can start from, look at or change — its table,
// module, fields (with the kind of value), which fields may be changed, and its relations to other objects.
// Workflows use it for triggers ("Ticket created", "Membership changed"), the pickers (object → field → value),
// loading a run's data (the record + everything one relation away) and the generic "change record" action.
// New table with business data = one entry here (objects.test.mjs fails for audited tables that are missing).
// Pure: the editor, the worker and the tests share it.
import type { OPS } from "./graph"

export type Kind = "text" | "number" | "date" | "bool" | "tags" | "ref" | "enum" | "link" // link = relation to another object (value: its id, e.g. "{contact.id}")
export type RefList = "events" | "membership_types" | "forms" | "courses" | "guest_lists" | "tags"
// write = "change record" may set it (validated by kind; refs must exist in the org).
export type Field = { key: string; kind: Kind; ref?: RefList; refTable?: string; options?: string[]; write?: true; time?: true; target?: string } // target: object of a link // time: a timestamp (date + time)
export type ObjectDef = {
  table: string
  module: string // shown only when the org has it on ("org" = always)
  idKey?: string // payload key of module events that carries its id
  fields: Field[]
  relations?: Record<string, string> // column → object key (loaded with the record, one hop)
  record?: true // can start workflows when created / changed / deleted
  // "create record": the fields that can be set, and links to objects of the run (e.g. the person) set automatically
  create?: { fields: string[]; parents?: Record<string, string> } // column → object key
  remove?: "soft" | "hard" // "delete record": soft = into the trash (restorable 30 days), hard = gone; money never
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
    table: "contacts", remove: "soft",
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
  note: { table: "contact_notes", remove: "hard", module: "crm", record: true, fields: [text("body")], relations: { contact_id: "contact" }, create: { fields: ["body"], parents: { contact_id: "contact" } } },
  membership: {
    table: "memberships", remove: "soft",
    module: "members",
    idKey: "membership_id",
    record: true,
    fields: [{ key: "type_id", kind: "ref", ref: "membership_types", refTable: "membership_types", write: true }, text("member_no"), date("starts_on"), date("ends_on", true), date("paused_from", true), date("paused_until", true), text("pause_reason", true), num("fee_cents", true), pick("fee_interval", ["month", "quarter", "half_year", "year", "none"], true), pick("payment_method", ["sepa", "transfer", "cash", "paypal", "other"], true), date("fee_free_until", true), text("note", true)],
    relations: { contact_id: "contact", type_id: "membership_type" },
    create: { fields: ["type_id", "starts_on", "ends_on", "note"], parents: { contact_id: "contact" } },
  },
  membership_type: { table: "membership_types", module: "members", fields: [text("name"), num("fee_cents"), bool("fee_is_minimum"), pick("interval", ["month", "quarter", "half_year", "year", "none"])] },
  due: {
    table: "member_dues",
    module: "members",
    record: true,
    fields: [pick("kind", ["fee", "entry", "levy"]), text("description"), num("amount_cents"), date("due_on"), pick("status", ["open", "paid", "cancelled"], true), date("paid_on"), num("reminders")],
    relations: { membership_id: "membership" },
  },
  event: {
    table: "events", remove: "soft",
    module: "events",
    idKey: "event_id",
    record: true,
    fields: [{ key: "id", kind: "ref", ref: "events" }, text("title"), pick("status", ["draft", "published", "cancelled"]), at("starts_at"), at("ends_at"), text("venue_name"), num("capacity")],
    create: { fields: ["title", "starts_at", "ends_at", "venue_name", "capacity"] }, // created as a draft
  },
  slot: {
    table: "event_slots", remove: "hard",
    module: "events",
    record: true,
    fields: [refTo("event_id", "events", "events"), text("title"), text("stage"), at("starts_at"), at("ends_at")],
    relations: { event_id: "event", artist_id: "artist" },
    create: { fields: ["event_id", "title", "stage", "starts_at", "ends_at"] },
  },
  artist: { table: "artists", remove: "soft", module: "events", record: true, fields: [text("name")], relations: { contact_id: "contact" }, create: { fields: ["name"] } },
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
  guest_list: {
    table: "guest_lists", remove: "soft",
    module: "guestlists",
    idKey: "list_id",
    record: true,
    fields: [{ key: "id", kind: "ref", ref: "guest_lists" }, text("name")],
    relations: { event_id: "event" },
    create: { fields: ["name"], parents: { event_id: "event" } },
  },
  guest: {
    table: "guest_entries", remove: "hard",
    module: "guestlists",
    record: true,
    fields: [{ key: "list_id", kind: "ref", ref: "guest_lists", refTable: "guest_lists" }, text("name"), text("email"), text("note", true), text("added_via")],
    relations: { list_id: "guest_list" },
    create: { fields: ["list_id", "name", "email", "note"] },
  },
  guest_checkin: { table: "guest_checkins", module: "guestlists", record: true, fields: [date("checked_in_at")], relations: { entry_id: "guest", event_id: "event" } },
  shift: {
    table: "shifts", remove: "hard",
    module: "shifts",
    idKey: "shift_id",
    record: true,
    fields: [refTo("event_id", "events", "events"), text("title"), at("starts_at"), at("ends_at"), num("needed"), bool("open", true)],
    relations: { event_id: "event" },
    create: { fields: ["title", "starts_at", "ends_at", "needed", "event_id"] },
  },
  shift_assignment: { table: "shift_assignments", remove: "hard", module: "shifts", record: true, fields: [pick("status", ["assigned", "applied"])], relations: { shift_id: "shift", staff_id: "staff" } },
  staff: { table: "staff", module: "shifts", idKey: "staff_id", record: true, fields: [text("name"), text("email"), text("role_label", true), num("target_hours", true), bool("active", true)], relations: { contact_id: "contact" } },
  time_entry: {
    table: "time_entries",
    module: "shifts",
    record: true,
    fields: [at("started_at"), at("ended_at"), num("break_minutes"), date("approved_at"), text("note")],
    relations: { staff_id: "staff", shift_id: "shift" },
    create: { fields: ["started_at", "ended_at", "note"], parents: { staff_id: "staff" } },
  },
  employee: {
    table: "employees", remove: "soft",
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
    table: "absences", remove: "hard",
    module: "hr",
    record: true,
    fields: [pick("kind", ["vacation", "sick", "unpaid", "other"]), date("starts_on"), date("ends_on"), bool("half_day")],
    relations: { employee_id: "employee" },
    create: { fields: ["kind", "starts_on", "ends_on"], parents: { employee_id: "employee" } },
  },
  course: { table: "courses", remove: "soft", module: "courses", idKey: "course_id", record: true, fields: [{ key: "id", kind: "ref", ref: "courses" }, text("title"), text("instructor"), num("capacity", true)] },
  course_session: {
    table: "course_sessions", remove: "hard",
    module: "courses",
    record: true,
    fields: [refTo("course_id", "courses", "courses"), at("starts_at"), at("ends_at"), bool("cancelled", true), text("note", true)],
    relations: { course_id: "course" },
    create: { fields: ["course_id", "starts_at", "ends_at", "note"] },
  },
  participant: {
    table: "course_participants", remove: "hard",
    module: "courses",
    record: true,
    fields: [{ key: "course_id", kind: "ref", ref: "courses", refTable: "courses" }, pick("status", ["enrolled", "waiting", "cancelled"], true), text("note", true)],
    relations: { course_id: "course", contact_id: "contact" },
    create: { fields: ["course_id", "note"], parents: { contact_id: "contact" } },
  },
  attendance: { table: "course_attendance", remove: "hard", module: "courses", record: true, fields: [bool("present")], relations: { participant_id: "participant", session_id: "course_session" } },
  form: {
    table: "forms", remove: "soft",
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
  task: {
    table: "tasks",
    idKey: "task_id",
    remove: "soft",
    module: "projects",
    record: true,
    fields: [text("title", true), text("description", true), date("start_on", true), date("due_on", true)],
    relations: { status_id: "task_status", project_id: "project" },
    create: { fields: ["title", "description", "start_on", "due_on"] }, // into the first column
  },
  project: {
    table: "projects",
    idKey: "project_id",
    remove: "soft",
    module: "projects",
    record: true,
    fields: [text("name", true), date("start_on", true), date("end_on", true), at("completed_at")],
    relations: { status_id: "task_status" },
  },
  rental_object: {
    table: "rental_objects",
    module: "rentals",
    idKey: "object_id",
    remove: "soft",
    record: true,
    fields: [text("name", true), text("kind"), pick("family", ["place", "vehicle", "item", "access", "other"]), pick("status", ["active", "inactive", "lost"], true), num("capacity"), text("description", true)],
    relations: { parent_id: "rental_object" },
  },
  rental: {
    table: "rentals",
    module: "rentals",
    idKey: "rental_id",
    remove: "soft",
    record: true,
    fields: [pick("status", ["request", "confirmed", "cancelled"], true), at("starts_at"), at("ends_at", true), at("notice_at"), num("price_cents", true), pick("unit", ["hour", "day", "week", "month", "year", "once"]), num("deposit_cents"), text("note", true)],
    relations: { object_id: "rental_object" },
  },
  task_status: { table: "task_statuses", module: "projects", fields: [text("name"), bool("is_done")] },
  wiki_page: { table: "wiki_pages", remove: "soft", module: "wiki", record: true, fields: [text("title")], relations: { parent_id: "wiki_page" } },
  cash_entry: {
    table: "cash_entries",
    module: "cashbook",
    record: true,
    fields: [text("number"), date("booked_on"), num("amount_cents"), text("description"), text("category"), pick("sphere", ["ideal", "asset", "purpose", "commercial"]), text("counterparty")],
    relations: { account_id: "cash_account", contact_id: "contact", document_id: "invoice" },
  },
  cash_account: { table: "cash_accounts", module: "cashbook", record: true, fields: [text("name"), pick("kind", ["cash", "bank"]), bool("active", true)] },
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
  file: { table: "files", remove: "soft", module: "org", record: true, fields: [text("name"), text("mime"), num("size"), text("entity"), text("folder")] },
  now: { table: "", module: "org", fields: [pick("weekday", ["1", "2", "3", "4", "5", "6", "7"]), num("hour"), date("date")] }, // when the step runs (Berlin)
} satisfies Record<string, ObjectDef>
export type ObjectKey = keyof typeof OBJECTS
export const def = (k: ObjectKey): ObjectDef => OBJECTS[k]

// Audited tables that are deliberately not workflow objects (setup, technical, sensitive). Everything else must be
// in OBJECTS – objects.test.mjs checks it, so a new feature's tables show up in workflows.
export const NOT_OBJECTS = [
  "api_keys", "cash_closings", "custom_fields", "document_items", "email_automations", "email_campaigns", "employee_private", "event_subscriptions",
  "invites", "letter_templates", "locations", "mcp_connections", "member_settings", "number_ranges", "org_billing", "org_integrations", "org_members",
  "org_modules", "orgs", "platform_admins", "positions", "rental_contacts", "rental_rates", "roles", "sepa_runs", "shift_series", "site_pages", "sites", "task_assignees", "project_links", "comments", "ticket_codes",
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
  "shift.assigned": ["shift", "staff", "event", "contact"],
  "membership.started": ["membership", "contact"],
  "membership.self_updated": ["membership", "contact"],
  "membership.ended": ["membership", "contact"],
  "membership.checked_in": ["membership", "contact", "event"],
  "form.submitted": ["submission", "form", "contact"],
  "course.enrolled": ["course", "contact"],
  "course.moved_up": ["course", "contact"],
  "rental.created": ["rental", "rental_object"],
  "rental.person_added": ["contact", "rental", "rental_object"],
  "rental.notice_received": ["rental", "rental_object"],
  "rental.renewed": ["rental", "rental_object"],
  "task.assigned": ["task"],
  "task.completed": ["task"],
}

/**
 * Objects a trigger brings: module events → their list; record triggers → the record + everything one relation
 * away. Plus derived: the person's current membership, and the time. Only objects of active modules.
 */
export function objectsFor(trigger: string, modules?: Set<string>): ObjectKey[] {
  const rec = parseRecordTrigger(trigger)
  const sched = /^schedule(?::([a-z_]+))?$/.exec(trigger)
  const root = rec?.object ?? (sched?.[1] && sched[1] in OBJECTS ? (sched[1] as ObjectKey) : null)
  const first: ObjectKey[] = root ? [root] : sched ? [] : (EVENT_OBJECTS[trigger] ?? ["contact"])
  // Up to two hops along relations (due → membership → person, guest → guest list → event).
  const rel = (o: ObjectKey) => Object.values(def(o).relations ?? {}) as ObjectKey[]
  const hop1 = first.flatMap(rel)
  const base = [...new Set<ObjectKey>([...first, ...hop1, ...hop1.flatMap(rel)])]
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

/** Objects "delete record" can delete in a run of this trigger. */
export const deletableFor = (trigger: string, modules?: Set<string>) => objectsFor(trigger, modules).filter((o) => def(o).remove)

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
  link: ["eq", "neq", "empty", "not_empty"],
}

/** An object's fields for searching: its catalog fields plus its relations as links ("membership.contact_id"). */
export const searchFields = (o: ObjectKey): Field[] => [
  ...def(o).fields,
  ...Object.entries(def(o).relations ?? {})
    .filter(([col]) => !def(o).fields.some((f) => f.key === col))
    .map(([col, target]) => ({ key: col, kind: "link" as const, target })),
]

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
  if (object === "contact" || object === "event" || object === "membership") out.custom = row.custom ?? {} // the org's custom fields
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
