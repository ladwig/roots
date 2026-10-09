// Event types orgs can subscribe to. Labels: events.types.<key>; Telegram texts: events.messages.<key>.
// Emitted by database triggers (core tables) or emit_event() from server code. Modules add theirs here.
export type EventType = { key: string; module: string } // module "org" = always available

export const eventTypes: EventType[] = [
  { key: "member.joined", module: "org" },
  { key: "member.left", module: "org" },
  { key: "member.invited", module: "org" },
  { key: "order.paid", module: "payments" },
  { key: "order.refunded", module: "payments" },
  { key: "order.failed", module: "payments" },
]

export const TEST_EVENT = "test.ping" // sent only by the "send test" button
