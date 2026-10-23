// Event types. Labels: events.types.<key>; message texts: events.messages.<key> (placeholders from the payload,
// plus {amount} formatted and {who}). Emitted by DB triggers or emit_event() from server code.
// - module: "org" = always available, "platform" = platform events (org_id null), else the module key.
// - audience: who among *people* gets notified (in-app/email/push), with default channels; omit = only org
//   destinations (webhooks, Telegram) can receive it.
// - href: where the notification leads.
export type PersonChannel = "in_app" | "email" | "push"
export const personChannels: PersonChannel[] = ["in_app", "email"] // "push" plugs in here later

export type EventType = {
  key: string
  module: string
  audience?: { permission?: string; platform?: boolean; users?: true; defaults: PersonChannel[] } // users = the payload's user_ids
  href?: (payload: Record<string, unknown>) => string
}

export const eventTypes: EventType[] = [
  { key: "member.joined", module: "org", audience: { permission: "org.members.manage", defaults: ["in_app"] }, href: () => "/settings/team" },
  { key: "member.left", module: "org", audience: { permission: "org.members.manage", defaults: ["in_app"] }, href: () => "/settings/team" },
  { key: "member.invited", module: "org" },
  { key: "domain.connected", module: "org", audience: { permission: "org.site.manage", defaults: ["in_app", "email"] }, href: () => "/website/domain" },
  { key: "order.paid", module: "payments", audience: { permission: "payments.view", defaults: ["in_app"] }, href: (p) => `/payments?edit=${p.order_id}` },
  { key: "order.refunded", module: "payments", audience: { permission: "payments.view", defaults: ["in_app"] }, href: (p) => `/payments?edit=${p.order_id}` },
  { key: "order.failed", module: "payments", audience: { permission: "payments.view", defaults: ["in_app"] }, href: (p) => `/payments?edit=${p.order_id}` },
  { key: "event.published", module: "events" },
  { key: "event.updated", module: "events" },
  { key: "event.cancelled", module: "events" },
  { key: "contact.created", module: "crm" },
  { key: "contacts.imported", module: "crm" },
  { key: "invoice.issued", module: "invoices" },
  { key: "invoice.paid", module: "invoices", audience: { permission: "invoices.view", defaults: ["in_app"] }, href: (p) => `/invoices/${p.document_id}` },
  { key: "invoice.cancelled", module: "invoices" },
  { key: "quote.issued", module: "invoices" },
  { key: "quote.accepted", module: "invoices", audience: { permission: "invoices.view", defaults: ["in_app"] }, href: (p) => `/invoices/${p.document_id}` },
  { key: "guestlist.signed_up", module: "guestlists", audience: { permission: "guestlists.view", defaults: ["in_app"] }, href: (p) => `/guestlists/${p.list_id}` },
  { key: "shift.assigned", module: "shifts" },
  { key: "rental.created", module: "rentals", audience: { permission: "rentals.view", defaults: ["in_app"] }, href: (p) => `/rentals/r/${p.rental_id}` },
  { key: "rental.person_added", module: "rentals" },
  { key: "rental.notice_received", module: "rentals", audience: { permission: "rentals.manage", defaults: ["in_app", "email"] }, href: (p) => `/rentals/r/${p.rental_id}` },
  { key: "rental.renewed", module: "rentals", audience: { permission: "rentals.view", defaults: ["in_app"] }, href: (p) => `/rentals/r/${p.rental_id}` },
  { key: "task.assigned", module: "projects", audience: { users: true, defaults: ["in_app", "email"] }, href: (p) => `/projects/tasks?task=${p.task_id}` },
  { key: "task.completed", module: "projects", audience: { users: true, defaults: ["in_app"] }, href: (p) => `/projects/tasks?task=${p.task_id}` },
  { key: "shift.applied", module: "shifts", audience: { permission: "shifts.manage", defaults: ["in_app"] }, href: (p) => `/shifts?shift=${p.shift_id}` },
  { key: "tickets.sold", module: "tickets", audience: { permission: "tickets.view", defaults: ["in_app"] }, href: (p) => `/events/${p.event_id}/tickets` },
  { key: "membership.started", module: "members", audience: { permission: "members.manage", defaults: ["in_app"] }, href: (p) => `/members/${p.membership_id}` },
  { key: "memberships.imported", module: "members" },
  { key: "membership.self_updated", module: "members", audience: { permission: "members.manage", defaults: ["in_app"] }, href: (p) => `/members/${p.membership_id}` },
  { key: "membership.ended", module: "members", audience: { permission: "members.manage", defaults: ["in_app"] }, href: (p) => `/members/${p.membership_id}` },
  { key: "membership.checked_in", module: "members" },
  { key: "form.submitted", module: "forms", audience: { permission: "forms.manage", defaults: ["in_app"] }, href: (p) => `/forms/${p.form_id}/submissions?sub=${p.submission_id}` },
  { key: "course.enrolled", module: "courses", audience: { permission: "courses.manage", defaults: [] }, href: (p) => `/courses/${p.course_id}#participants` },
  { key: "course.moved_up", module: "courses", audience: { permission: "courses.manage", defaults: ["in_app"] }, href: (p) => `/courses/${p.course_id}#participants` },
  { key: "workflow.notified", module: "automations", audience: { permission: "automations.view", defaults: ["in_app"] }, href: (p) => `/automations/${p.workflow_id}` },
  { key: "org.created", module: "platform", audience: { platform: true, defaults: ["in_app", "email"] }, href: (p) => `/admin/orgs?edit=${p.org_id}` },
]

export const getEventType = (key: string) => eventTypes.find((e) => e.key === key)
export const TEST_EVENT = "test.ping" // sent only by the "send test" button
