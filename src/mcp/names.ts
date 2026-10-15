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
const DANGER = /\/(send|sends|refund|issue|cancel|reminders|sepa-runs|xml|publish|activate)(\/|$)/
export function riskOf(method: string, path: string): Risk {
  if (method === "GET") return "read"
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
