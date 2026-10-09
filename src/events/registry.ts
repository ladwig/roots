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
  audience?: { permission?: string; platform?: boolean; defaults: PersonChannel[] }
  href?: (payload: Record<string, unknown>) => string
}

export const eventTypes: EventType[] = [
  { key: "member.joined", module: "org", audience: { permission: "org.members.manage", defaults: ["in_app"] }, href: () => "/settings/members" },
  { key: "member.left", module: "org", audience: { permission: "org.members.manage", defaults: ["in_app"] }, href: () => "/settings/members" },
  { key: "member.invited", module: "org" },
  { key: "order.paid", module: "payments", audience: { permission: "payments.view", defaults: ["in_app"] }, href: (p) => `/payments?edit=${p.order_id}` },
  { key: "order.refunded", module: "payments", audience: { permission: "payments.view", defaults: ["in_app"] }, href: (p) => `/payments?edit=${p.order_id}` },
  { key: "order.failed", module: "payments", audience: { permission: "payments.view", defaults: ["in_app"] }, href: (p) => `/payments?edit=${p.order_id}` },
  { key: "event.published", module: "events" },
  { key: "event.updated", module: "events" },
  { key: "event.cancelled", module: "events" },
  { key: "contact.created", module: "crm" },
  { key: "org.created", module: "platform", audience: { platform: true, defaults: ["in_app", "email"] }, href: (p) => `/admin/orgs?edit=${p.org_id}` },
]

export const getEventType = (key: string) => eventTypes.find((e) => e.key === key)
export const TEST_EVENT = "test.ping" // sent only by the "send test" button
