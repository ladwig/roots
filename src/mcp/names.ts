// MCP operations from API endpoints (pure, tested in mcp.test.mjs): stable names, risk class, confirm tokens.

/** "GET /events" → events_list, "GET /events/{id}" → events_get, "POST /events/{id}/restore" → events_restore,
 *  "GET /workflows/{id}/runs" → workflows_runs_list, "PUT /rentals/{id}/people" → rentals_people_set. */
export function opName(method: string, path: string) {
  const parts = path.split("/").filter(Boolean)
  const words = parts.filter((p) => !p.startsWith("{")).map((p) => p.replace(/[^a-z0-9]+/gi, "_").toLowerCase())
  const lastIsParam = parts.at(-1)?.startsWith("{") ?? false
  const verb =
    method === "GET" ? (lastIsParam ? "get" : "list")
    : method === "POST" ? (lastIsParam || parts.length === 1 ? "create" : null)
    : method === "PATCH" ? "update"
    : method === "PUT" ? "set"
    : "delete"
  // POST /x/{id}/action → x_action (the last word is the verb already)
  return (verb ? [...words, verb] : words).join("_").slice(0, 64)
}

/** Names unique across the list (a clash gets _2, _3 …). */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const k = (seen.get(n) ?? 0) + 1
    seen.set(n, k)
    return k === 1 ? n : `${n}_${k}`.slice(0, 64)
  })
}

export type Risk = "read" | "write" | "danger"
// Calls with effects outside the database (emails), money, or that can't be undone need the confirm step.
const DANGER = /\/(send|sends|refund|issue|cancel|reminders|sepa-runs|xml|publish|activate|invites)(\/|$)/
// POSTs that only compute something (check a draft) count as reads.
const PURE = /\/(validate|preview)$/
export function riskOf(method: string, path: string): Risk {
  if (method === "GET" || PURE.test(path)) return "read"
  if (method === "DELETE" || DANGER.test(path)) return "danger"
  return "write"
}

/** Stable JSON (sorted keys) so the same arguments always give the same confirm token. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
  return JSON.stringify(v ?? null)
}

/** 5-minute windows: a token is valid in its window and the next one. */
export const confirmWindow = (now: number) => Math.floor(now / 300_000)
export const confirmMessage = (keyId: string, op: string, args: unknown, window: number) => `${keyId}|${op}|${canonical(args)}|${window}`

// Where a record of an API resource lives in the App (so Claude can link "here's your event").
const APP_PAGES: Record<string, (id: string, r: Record<string, unknown>) => string> = {
  events: (id) => `/events/${id}`,
  contacts: (id) => `/contacts/${id}`,
  members: (id) => `/members/${id}`,
  courses: (id) => `/courses/${id}`,
  employees: (id) => `/hr/${id}`,
  forms: (id) => `/forms/${id}`,
  "guest-lists": (id) => `/guestlists/${id}`,
  invoices: (id) => `/invoices/${id}`,
  "letter-templates": (id) => `/files/templates/${id}`,
  "rental-objects": (id) => `/rentals/${id}`,
  rentals: (id) => `/rentals/r/${id}`,
  tasks: (id) => `/projects/tasks?task=${id}`,
  projects: (id) => `/projects/${id}`,
  "wiki-pages": (id) => `/wiki/${id}`,
  workflows: (id) => `/automations/${id}`,
  "ticket-types": (_id, r) => (typeof r.event_id === "string" ? `/events/${r.event_id}/tickets` : ""),
}

/** App link for a single record an operation returned ("/events/<id>"), or null. Only top-level resources; for
 *  "/x/{id}/action" only when the result is that same record (not a child created under it). */
export function appPath(path: string, result: unknown, params: Record<string, string> = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null
  const r = result as Record<string, unknown>
  const res = path.split("/").filter(Boolean)[0]
  const page = APP_PAGES[res]
  const id = typeof r.id === "string" ? r.id : null
  const parts = path.split("/").filter(Boolean)
  if (!page || !id || parts.length > 3 || (parts.length === 3 && params.id !== id)) return null
  return page(id, r) || null
}

/** The call's input: "arguments" (also accepted: params / args / input), else the fields next to "operation". */
export function callArgs(a: Record<string, unknown>) {
  for (const k of ["arguments", "params", "args", "input"]) if (a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) return a[k] as Record<string, unknown>
  return Object.fromEntries(Object.entries(a).filter(([k]) => !["operation", "confirm_token", "calls"].includes(k)))
}
