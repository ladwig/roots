// Public API (v1): endpoint definitions are data. The catch-all route dispatches requests to them and the OpenAPI
// spec is generated from the same zod schemas, so docs and behaviour can't drift.
//
// Auth: `Authorization: Bearer roots_…` → SHA-256 → api_key_auth() → org + key permissions + enabled modules.
// Handlers get the admin client (no user session behind an API key) and MUST filter every query by `org.id`;
// ponytail: app-side tenant filter here instead of RLS; switch to per-key JWTs + RLS if third parties write handlers.
import { createHash } from "node:crypto"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"

export type ApiCtx<Q, B> = {
  orgId: string
  db: ReturnType<typeof createAdminClient>
  params: Record<string, string>
  query: Q
  body: B
}

export type Endpoint<Q extends z.ZodType = z.ZodType, B extends z.ZodType = z.ZodType> = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string // "/events/{id}"
  permission: string // "events.view"
  tag: string
  summary: string
  description?: string
  query?: Q
  body?: B
  response: z.ZodType
  status?: number // success status, default 200
  handler(ctx: ApiCtx<z.infer<Q>, z.infer<B>>): Promise<unknown>
}

export const endpoint = <Q extends z.ZodType, B extends z.ZodType>(e: Endpoint<Q, B>) => e as unknown as Endpoint

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}
export const notFound = () => new ApiError(404, "not_found", "Not found.")

// Shared bits
export const uuid = z.uuid()
export const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Max. results (1–100)"),
  offset: z.coerce.number().int().min(0).default(0).describe("Results to skip"),
})
export const list = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item), limit: z.number(), offset: z.number(), has_more: z.boolean() })
// Fetch limit+1 rows to know whether there's more.
export const paged = <T>(rows: T[] | null, q: { limit: number; offset: number }) => ({
  data: (rows ?? []).slice(0, q.limit),
  limit: q.limit,
  offset: q.offset,
  has_more: (rows?.length ?? 0) > q.limit,
})

const hasPerm = (perms: string[], perm: string) => perms.some((p) => p === "*" || p === perm || p === `${perm.split(".")[0]}.*`)
// Permission → module that must be on ("crm.view" → crm). Core permissions ("org.*") need no module.
const moduleOf = (perm: string) => perm.split(".")[0]

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex")

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } })
const error = (e: ApiError) => json(e.status, { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } })

// "/events/{id}/tickets" vs "/events/abc/tickets" → { id: "abc" }
function match(pattern: string, path: string) {
  const a = pattern.split("/").filter(Boolean)
  const b = path.split("/").filter(Boolean)
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("{")) params[a[i].slice(1, -1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

export async function dispatch(endpoints: Endpoint[], request: Request, path: string) {
  try {
    const candidates = endpoints.map((e) => ({ e, params: match(e.path, path) })).filter((c) => c.params)
    if (!candidates.length) throw notFound()
    const hit = candidates.find((c) => c.e.method === request.method)
    if (!hit) throw new ApiError(405, "method_not_allowed", `Use ${candidates.map((c) => c.e.method).join(", ")}.`)
    const { e } = hit
    const params = hit.params!

    const key = request.headers.get("authorization")?.match(/^Bearer\s+(roots_[A-Za-z0-9]+)$/)?.[1]
    if (!key) throw new ApiError(401, "unauthorized", "Send an API key: Authorization: Bearer roots_…")
    const db = createAdminClient()
    const { data: auth } = await db.rpc("api_key_auth", { p_hash: hashKey(key) }).maybeSingle()
    if (!auth) throw new ApiError(401, "unauthorized", "Unknown or revoked API key.")
    if (!hasPerm(auth.permissions, e.permission)) throw new ApiError(403, "forbidden", `This key lacks the permission "${e.permission}".`)
    const mod = moduleOf(e.permission)
    if (mod !== "org" && !auth.modules.includes(mod)) throw new ApiError(403, "module_disabled", `The "${mod}" module is not enabled for this organisation.`)

    for (const [k, v] of Object.entries(params)) if (k.endsWith("id") && !uuid.safeParse(v).success) throw notFound()
    const url = new URL(request.url)
    const query = e.query ? e.query.safeParse(Object.fromEntries(url.searchParams)) : { success: true as const, data: {} }
    if (!query.success) throw new ApiError(400, "invalid_query", "Invalid query parameters.", z.flattenError(query.error).fieldErrors)
    let body: unknown = {}
    if (e.body) {
      const raw = await request.json().catch(() => undefined)
      const parsed = e.body.safeParse(raw)
      if (!parsed.success) throw new ApiError(400, "invalid_body", "Invalid request body.", z.flattenError(parsed.error).fieldErrors)
      body = parsed.data
    }
    const result = await e.handler({ orgId: auth.org_id, db, params, query: query.data, body })
    return json(e.status ?? 200, result)
  } catch (err) {
    if (err instanceof ApiError) return error(err)
    console.error("api", err)
    return error(new ApiError(500, "internal", "Something went wrong."))
  }
}
