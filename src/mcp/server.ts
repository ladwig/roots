// MCP server over the key API: every endpoint the caller's key may use becomes an "operation" (generated from
// src/api/v1, so it grows with the API). Instead of ~240 tools, Claude gets a few: look up operations, describe one,
// and call it through roots_read / roots_write / roots_danger (split by risk so clients can allow them separately).
// Dangerous calls (delete, emails, money, irreversible) take two steps: a preview with a short-lived confirm token,
// then the same call with that token. Same checks as the HTTP API: authenticate → allowed → parseInput → invoke.
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { ApiError, invoke, mayCall, parseInput, type Auth, type Endpoint } from "@/api/core"
import { endpoints } from "@/api/v1"
import { createAdminClient } from "@/lib/supabase/admin"
import { confirmMessage, confirmWindow, opName, riskOf, uniqueNames, type Risk } from "./names"

type Op = { name: string; e: Endpoint; risk: Risk; params: string[] }

const OPS: Op[] = (() => {
  const usable = endpoints.filter((e) => !e.upload)
  const names = uniqueNames(usable.map((e) => opName(e.method, e.path)))
  return usable.map((e, i) => ({ name: names[i], e, risk: riskOf(e.method, e.path), params: [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) }))
})()

const schemaOf = (s: z.ZodType | undefined) => (s ? (z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, unknown>; required?: string[] }) : null)

/** One flat input object: path params + query + body fields (body nested under "body" if names clash). */
function inputSchema(op: Op) {
  const props: Record<string, unknown> = {}
  const required: string[] = []
  for (const p of op.params) {
    props[p] = { type: "string", description: "Path parameter (id)" }
    required.push(p)
  }
  const q = schemaOf(op.e.query)
  for (const [k, v] of Object.entries(q?.properties ?? {})) props[k] = v
  const b = schemaOf(op.e.body)
  const clash = Object.keys(b?.properties ?? {}).some((k) => k in props)
  if (b && clash) props.body = b
  else for (const [k, v] of Object.entries(b?.properties ?? {})) props[k] = v
  if (b && !clash) required.push(...(b.required ?? []))
  return { type: "object", properties: props, required }
}

function split(op: Op, args: Record<string, unknown>) {
  const params: Record<string, string> = {}
  for (const p of op.params) params[p] = String(args[p] ?? "")
  const queryKeys = Object.keys(schemaOf(op.e.query)?.properties ?? {})
  const query = Object.fromEntries(Object.entries(args).filter(([k]) => queryKeys.includes(k)))
  const b = schemaOf(op.e.body)
  const body = b && "body" in inputSchema(op).properties && !Object.keys(b.properties ?? {}).includes("body") ? args.body : Object.fromEntries(Object.entries(args).filter(([k]) => !op.params.includes(k) && !queryKeys.includes(k)))
  return { params, query, body: op.e.body ? body : undefined }
}

const secret = () => process.env.MCP_CONFIRM_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? "dev"
const sign = (msg: string) => createHmac("sha256", secret()).update(msg).digest("base64url")
function tokenOk(token: string, keyId: string, op: string, args: unknown) {
  const now = confirmWindow(Date.now())
  return [now, now - 1].some((w) => {
    const want = Buffer.from(sign(confirmMessage(keyId, op, args, w)))
    const got = Buffer.from(token)
    return want.length === got.length && timingSafeEqual(want, got)
  })
}

const text = (v: unknown, isError = false) => {
  const s = JSON.stringify(v, null, 1)
  return { content: [{ type: "text" as const, text: s.length > 40_000 ? `${s.slice(0, 40_000)}\n… (truncated – use limit/offset)` : s }], ...(isError ? { isError: true } : {}) }
}

const INSTRUCTIONS = `roots is the back office of a club / collective / small org (contacts, memberships and dues, events and tickets, shifts, invoices, email, forms, automations, rentals …).
How to work: 1) roots_find_operations to see what this connection may do (filter by a word like "contact" or "rental"), 2) roots_describe_operation for the input schema, 3) call it with roots_read (GET), roots_write (create/change) or roots_danger (delete, send emails, money, irreversible – first call returns a preview + confirm_token; show the preview to the user and only repeat the call with the token after they agree).
Conventions: money in cents (integer), timestamps ISO 8601 (UTC), days YYYY-MM-DD, the org's time zone is Europe/Berlin. Lists take limit/offset and return has_more. Deleting usually moves to a trash (restorable for 30 days). German area names: Kontakte = contacts, Mitgliedschaften = memberships, Beiträge = dues, Veranstaltungen = events, Schichten = shifts, Vermietung = rentals, Rechnungen = invoices.`

/** A fresh server per request (stateless); tools see only what `auth` may call. */
export function mcpServer(auth: Auth, request: Request) {
  const server = new Server({ name: "roots", version: "1.0.0" }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS })
  const ops = OPS.filter((o) => mayCall(auth, o.e))
  const find = (name: unknown) => ops.find((o) => o.name === name)
  const call = { type: "object", properties: { operation: { type: "string", description: "Operation name from roots_find_operations" }, arguments: { type: "object", description: "Input as described by roots_describe_operation" } }, required: ["operation"] }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "roots_whoami", title: "Who am I", description: "The organisation this connection works in, its enabled modules and the permissions it has.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
      {
        name: "roots_find_operations",
        title: "Find operations",
        description: "List what this connection can do in roots: operation name, method, path, summary and risk (read/write/danger). Filter with a word (e.g. 'contact', 'rental', 'automation').",
        inputSchema: { type: "object", properties: { query: { type: "string", description: "Word to search in names and summaries" }, risk: { type: "string", enum: ["read", "write", "danger"] } } },
        annotations: { readOnlyHint: true },
      },
      { name: "roots_describe_operation", title: "Describe an operation", description: "Full description, permission, risk and the JSON input schema of one operation.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }, annotations: { readOnlyHint: true } },
      { name: "roots_read", title: "Read from roots", description: "Run a read operation (risk 'read'). Changes nothing.", inputSchema: call, annotations: { readOnlyHint: true } },
      { name: "roots_write", title: "Change roots", description: "Run a creating/changing operation (risk 'write').", inputSchema: call, annotations: { readOnlyHint: false, destructiveHint: false } },
      {
        name: "roots_danger",
        title: "Delete / send / irreversible",
        description: "Run an operation with risk 'danger' (delete, send emails, money, cannot be undone). Without confirm_token it only returns a preview and a token valid ~5 minutes; show the preview to the user and call again with the same operation, arguments and the token once they agree.",
        inputSchema: { ...call, properties: { ...call.properties, confirm_token: { type: "string" } } },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name
    const a = (req.params.arguments ?? {}) as Record<string, unknown>
    try {
      if (name === "roots_whoami") {
        const { data: org } = await createAdminClient().from("orgs").select("name, slug").eq("id", auth.org_id).maybeSingle()
        return text({ org, modules: auth.modules, permissions: auth.permissions })
      }
      if (name === "roots_find_operations") {
        const q = String(a.query ?? "").toLowerCase()
        const hits = ops.filter((o) => (!a.risk || o.risk === a.risk) && (!q || `${o.name} ${o.e.summary} ${o.e.tag}`.toLowerCase().includes(q)))
        return text(hits.map((o) => ({ name: o.name, method: o.e.method, path: o.e.path, summary: o.e.summary, risk: o.risk })))
      }
      if (name === "roots_describe_operation") {
        const op = find(a.name)
        if (!op) return text({ error: "Unknown operation or not allowed for this connection." }, true)
        return text({ name: op.name, method: op.e.method, path: op.e.path, summary: op.e.summary, description: op.e.description, permission: op.e.permission, risk: op.risk, tool: `roots_${op.risk}`, input: inputSchema(op) })
      }
      const risk = name === "roots_read" ? "read" : name === "roots_write" ? "write" : name === "roots_danger" ? "danger" : null
      if (!risk) return text({ error: `Unknown tool ${name}.` }, true)
      const op = find(a.operation)
      if (!op) return text({ error: "Unknown operation or not allowed for this connection. Use roots_find_operations." }, true)
      if (op.risk !== risk) return text({ error: `${op.name} has risk "${op.risk}": call it with roots_${op.risk}.` }, true)
      const args = (a.arguments ?? {}) as Record<string, unknown>
      const input = split(op, args)
      for (const [k, v] of Object.entries(input.params)) if (k.endsWith("id") && !/^[0-9a-f-]{36}$/.test(v)) throw new ApiError(404, "not_found", `${k}: not a valid id.`)
      const { query, body } = parseInput(op.e, { query: input.query, body: input.body })
      if (risk === "danger" && !(typeof a.confirm_token === "string" && tokenOk(a.confirm_token, auth.key_id, op.name, args))) {
        // Preview of the record it hits: DELETE /x/{id} → GET /x/{id}; POST /x/{id}/send → GET /x/{id}.
        const base = op.e.method === "DELETE" ? op.e.path : op.e.path.replace(/\/[a-z-]+$/, "")
        const preview = op.params.length ? OPS.find((x) => x.e.method === "GET" && x.e.path === base) : undefined
        const target = preview && mayCall(auth, preview.e) ? await invoke(preview.e, auth, { params: input.params, query: {}, body: undefined }, request).catch(() => null) : null
        return text({ confirm: true, operation: op.name, summary: op.e.summary, method: op.e.method, path: op.e.path, arguments: args, target, confirm_token: sign(confirmMessage(auth.key_id, op.name, args, confirmWindow(Date.now()))), note: "Nothing happened yet. Show this to the user; repeat the same call with confirm_token to execute." })
      }
      return text(await invoke(op.e, auth, { params: input.params, query, body }, request))
    } catch (e) {
      if (e instanceof ApiError) return text({ error: { code: e.code, message: e.message, details: e.details } }, true)
      console.error("mcp", e)
      return text({ error: { code: "internal", message: "Something went wrong." } }, true)
    }
  })
  return server
}
