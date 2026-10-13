// What a workflow can look at: the objects a trigger brings (person, event, order …), their fields and what kind
// of value each field holds. The editor builds its pickers from this (object → field → fitting comparison →
// value from real data), the worker loads exactly these objects into the run's context (`<object>.<field>`).
// Pure; a new object = one entry here + its loader in server.ts.
import type { OPS } from "./graph"

export type Kind = "text" | "number" | "date" | "bool" | "tags" | "ref" | "enum"
export type Field = { key: string; kind: Kind; ref?: RefList; options?: string[]; write?: true } // write = "set field" may change it
export type RefList = "events" | "membership_types" | "forms" | "courses" | "guest_lists" | "tags"
export type ObjectKey = "contact" | "event" | "order" | "membership" | "form" | "course" | "invoice" | "guest_list" | "shift"
export type ObjectDef = { idKey: string; table: string; module: string; fields: Field[] } // module: shown only when the org has it on

export const OBJECTS: Record<ObjectKey, ObjectDef> = {
  contact: {
    idKey: "contact_id",
    table: "contacts", module: "crm",
    fields: [
      { key: "first_name", kind: "text", write: true },
      { key: "last_name", kind: "text", write: true },
      { key: "company", kind: "text", write: true },
      { key: "email", kind: "text" },
      { key: "phone", kind: "text", write: true },
      { key: "city", kind: "text", write: true },
      { key: "country", kind: "text", write: true },
      { key: "birthday", kind: "date", write: true },
      { key: "tags", kind: "tags", ref: "tags" },
      { key: "unsubscribed", kind: "bool" },
    ],
  },
  event: {
    idKey: "event_id",
    table: "events", module: "events",
    fields: [
      { key: "id", kind: "ref", ref: "events" },
      { key: "title", kind: "text" },
      { key: "status", kind: "enum", options: ["draft", "published", "cancelled"] },
      { key: "starts_at", kind: "date" },
      { key: "venue_name", kind: "text" },
    ],
  },
  order: {
    idKey: "order_id",
    table: "pay_orders", module: "payments",
    fields: [
      { key: "amount", kind: "number" },
      { key: "status", kind: "enum", options: ["open", "paid", "cancelled", "refunded"] },
      { key: "source_module", kind: "enum", options: ["tickets", "members", "invoices"] },
    ],
  },
  membership: {
    idKey: "membership_id",
    table: "memberships", module: "members",
    fields: [
      { key: "type_id", kind: "ref", ref: "membership_types", write: true },
      { key: "member_no", kind: "text" },
      { key: "starts_on", kind: "date" },
      { key: "ends_on", kind: "date", write: true },
    ],
  },
  form: { idKey: "form_id", table: "forms", module: "forms", fields: [{ key: "id", kind: "ref", ref: "forms" }, { key: "title", kind: "text" }] },
  course: {
    idKey: "course_id",
    table: "courses", module: "courses",
    fields: [
      { key: "id", kind: "ref", ref: "courses" },
      { key: "title", kind: "text" },
      { key: "capacity", kind: "number" },
    ],
  },
  invoice: {
    idKey: "document_id",
    table: "documents", module: "invoices",
    fields: [
      { key: "kind", kind: "enum", options: ["invoice", "quote", "cancellation"] },
      { key: "number", kind: "text" },
      { key: "amount", kind: "number" },
    ],
  },
  guest_list: { idKey: "list_id", table: "guest_lists", module: "guestlists", fields: [{ key: "id", kind: "ref", ref: "guest_lists" }, { key: "name", kind: "text" }] },
  shift: { idKey: "shift_id", table: "shifts", module: "shifts", fields: [{ key: "title", kind: "text" }, { key: "starts_at", kind: "date" }] },
}

// Which objects each trigger brings (from its payload). The person is found from contact_id or email.
export const EVENT_OBJECTS: Record<string, ObjectKey[]> = {
  "contact.created": ["contact"],
  "tickets.sold": ["contact", "event", "order"],
  "order.paid": ["contact", "order"],
  "order.refunded": ["contact", "order"],
  "order.failed": ["contact", "order"],
  "event.published": ["event"],
  "event.updated": ["event"],
  "event.cancelled": ["event"],
  "invoice.issued": ["contact", "invoice"],
  "invoice.paid": ["contact", "invoice"],
  "invoice.cancelled": ["contact", "invoice"],
  "quote.issued": ["contact", "invoice"],
  "quote.accepted": ["contact", "invoice"],
  "guestlist.signed_up": ["contact", "guest_list"],
  "shift.applied": ["shift"],
  "membership.started": ["contact", "membership"],
  "membership.self_updated": ["contact", "membership"],
  "membership.ended": ["contact", "membership"],
  "form.submitted": ["contact", "form"],
  "course.enrolled": ["contact", "course"],
  "course.moved_up": ["contact", "course"],
}
export const objectsFor = (event: string, modules?: Set<string>): ObjectKey[] =>
  (EVENT_OBJECTS[event] ?? ["contact"]).filter((o) => !modules || modules.has(OBJECTS[o].module))

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

// Objects "set field" can write (custom fields exist on contacts only, see CUSTOM_ENTITIES).
export const WRITABLE: ObjectKey[] = ["contact", "membership"]

/** "contact.custom.level" → { object: "contact", field: "custom.level" } */
export const splitPath = (path: string) => {
  const i = path.indexOf(".")
  return i < 0 ? { object: path, field: "" } : { object: path.slice(0, i), field: path.slice(i + 1) }
}
