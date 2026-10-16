// MCP server over the key API: every endpoint the caller's key may use becomes an "operation" (generated from
// src/api/v1, so it grows with the API). Instead of ~240 tools, Claude gets a few: look up operations, describe one,
// and call it through roots_read / roots_write / roots_danger (split by risk so clients can allow them separately).
// Dangerous calls (delete, emails, money, irreversible) take two steps: a preview with a short-lived confirm token,
// then the same call with that token. Same checks as the HTTP API: authenticate → allowed → parseInput → invoke.
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { ApiError, invoke, mayCall, parseInput, rateLimit, type Auth, type Endpoint } from "@/api/core"
import { endpoints } from "@/api/v1"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import { uploadLink } from "@/api/upload-link"
import { imagesOf, UPLOAD_INPUT, uploadRequest } from "./media"
import { getPrompt, promptList } from "./prompts"
import { appPath, callArgs, confirmMessage, confirmWindow, opName, riskOf, uniqueNames, type Risk } from "./names"

type Op = { name: string; e: Endpoint; risk: Risk; params: string[] }

const OPS: Op[] = (() => {
  const usable = endpoints
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
  if (op.e.upload) Object.assign(props, UPLOAD_INPUT)
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
How to work (fewer round trips = faster): 1) roots_find_operations to see what this connection may do (filter by a word like "contact" or "rental"), 2) roots_describe_operation for the input schema (pass names: [...] to get several at once), 3) call it with roots_read (GET), roots_write (create/change) or roots_danger (delete, send emails, money, irreversible – first call returns a preview + confirm_token; show the preview to the user and only repeat the call with the token after they agree). For several creates/changes use calls: [{ operation, arguments }, …] in one roots_write. Results of single records carry app_url: link it so the user can open the record in roots.
Pictures and files: upload operations (e.g. the event picture) take image_url (https) or image_base64. A picture or document the person pasted into the chat can't be passed on directly: call the upload operation without image_url/image_base64 (or files_upload_link for documents) and give the person the returned upload_url as a link; they drop the file there. Records with a picture return it as an image. Guided setups are available as prompts (verein_einrichten, mitglieder_importieren, event_erstellen).
Automations: GET workflows_catalog_list (with trigger=…) for triggers, node types and fields → draft a graph (positions optional) → workflows_validate until problems is empty → workflows_create (created inactive) → summarise it for the user → workflows_update { active: true } once they agree. workflow_templates_list has ready-made graphs.
Conventions: money in cents (integer), timestamps ISO 8601 (UTC), days YYYY-MM-DD, the org's time zone is Europe/Berlin. Lists take limit/offset and return has_more. Deleting usually moves to a trash (restorable for 30 days). German area names: Kontakte = contacts, Mitgliedschaften = memberships, Beiträge = dues, Veranstaltungen = events, Schichten = shifts, Vermietung = rentals, Rechnungen = invoices.`

/** A fresh server per request (stateless); tools see only what `auth` may call. */
export function mcpServer(auth: Auth, request: Request) {
  const server = new Server({ name: "roots", version: "1.0.0" }, { capabilities: { tools: {}, prompts: {} }, instructions: INSTRUCTIONS })
  const ops = OPS.filter((o) => mayCall(auth, o.e))
  const find = (name: unknown) => ops.find((o) => o.name === name)
  const one = { operation: { type: "string", description: "Operation name from roots_find_operations" }, arguments: { type: "object", description: "Input as described by roots_describe_operation (path ids, query and body fields in one object)" } }
  const call = {
    type: "object",
    properties: { ...one, calls: { type: "array", maxItems: 25, description: "Several calls at once instead of operation/arguments: [{ operation, arguments }, …] – run in order, each with its own result.", items: { type: "object", properties: one, required: ["operation"] } } },
  }

  const fail = (e: unknown) => {
    if (e instanceof ApiError) return { error: { code: e.code, message: e.message, details: e.details } }
    console.error("mcp", e)
    return { error: { code: "internal", message: "Something went wrong." } }
  }
  // One operation call: checks risk, validates (wrong input → the expected schema comes along), runs it, adds the
  // App link of the record. Danger without a valid token → preview + confirm token.
  async function runOne(risk: Risk, a: Record<string, unknown>): Promise<unknown> {
    const op = find(a.operation)
    if (!op) return { error: "Unknown operation or not allowed for this connection. Use roots_find_operations." }
    if (op.risk !== risk) return { error: `${op.name} has risk "${op.risk}": call it with roots_${op.risk}.` }
    const args = callArgs(a)
    const input = split(op, args)
    for (const [k, v] of Object.entries(input.params)) if (k.endsWith("id") && !/^[0-9a-f-]{36}$/.test(v)) return { error: { code: "not_found", message: `${k}: not a valid id.` }, expected: inputSchema(op) }
    let parsed
    try {
      parsed = parseInput(op.e, { query: input.query, body: input.body })
    } catch (e) {
      return { ...fail(e), expected: inputSchema(op) }
    }
    if (risk === "danger" && !(typeof a.confirm_token === "string" && tokenOk(a.confirm_token, auth.key_id, op.name, args))) {
      // Preview of the record it hits: DELETE /x/{id} → GET /x/{id}; POST /x/{id}/send → GET /x/{id}.
      const base = op.e.method === "DELETE" ? op.e.path : op.e.path.replace(/\/[a-z-]+$/, "")
      const preview = op.params.length ? OPS.find((x) => x.e.method === "GET" && x.e.path === base) : undefined
      const target = preview && mayCall(auth, preview.e) ? await invoke(preview.e, auth, { params: input.params, query: {}, body: undefined }, request).catch(() => null) : null
      return { confirm: true, operation: op.name, summary: op.e.summary, method: op.e.method, path: op.e.path, arguments: args, target, confirm_token: sign(confirmMessage(auth.key_id, op.name, args, confirmWindow(Date.now()))), note: "Nothing happened yet. Show this to the user; repeat the same call with confirm_token to execute." }
    }
    await rateLimit(auth, op.e.method !== "GET" && risk !== "read")
    // Upload endpoints without the picture itself → a link for the person (pasted chat images can't be passed on).
    if (op.e.upload && !args.image_url && !args.image_base64) {
      const base = OPS.find((x) => x.e.method === "GET" && x.e.path === op.e.path.replace(/\/[a-z-]+$/, ""))
      const rec = base && mayCall(auth, base.e) ? ((await invoke(base.e, auth, { params: input.params, query: {}, body: undefined }, request).catch(() => null)) as Record<string, unknown> | null) : null
      if (base && !rec) return { error: { code: "not_found", message: "Not found." } }
      const label = rec ? String(rec.title ?? rec.name ?? "") || undefined : undefined
      return { ...uploadLink(auth, { kind: "image", path: Object.entries(input.params).reduce((p, [k, v]) => p.replace(`{${k}}`, v), op.e.path), label }), note: "Give the person this link (as a clickable link): they open it and drop the picture; it is set right away. Then read the record to see it." }
    }
    // Upload endpoints read a raw body: built from image_url / image_base64.
    const req = op.e.upload ? await uploadRequest(args, op.e.method) : request
    const result = await invoke(op.e, auth, { params: input.params, query: parsed.query, body: parsed.body }, req)
    const link = op.e.method !== "GET" || op.params.length ? appPath(op.e.path, result, input.params) : null
    return link && result && typeof result === "object" ? { ...(result as object), app_url: `${APP_URL}${link}` } : result
  }

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: promptList() }))
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const p = getPrompt(req.params.name, req.params.arguments)
    if (!p) throw new Error(`Unknown prompt ${req.params.name}.`)
    return p
  })

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
      {
        name: "roots_describe_operation",
        title: "Describe operations",
        description: "Full description, permission, risk and the JSON input schema of one operation (name) or several at once (names, up to 10).",
        inputSchema: { type: "object", properties: { name: { type: "string" }, names: { type: "array", items: { type: "string" } } } },
        annotations: { readOnlyHint: true },
      },
      { name: "roots_read", title: "Read from roots", description: "Run an operation with risk 'read' (reading, or checking a draft). Changes nothing.", inputSchema: call, annotations: { readOnlyHint: true } },
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
        const names = (Array.isArray(a.names) ? a.names : [a.name]).slice(0, 10)
        const out = names.map((n) => {
          const op = find(n)
          return op
            ? { name: op.name, method: op.e.method, path: op.e.path, summary: op.e.summary, description: op.e.description, permission: op.e.permission, risk: op.risk, tool: `roots_${op.risk}`, input: inputSchema(op) }
            : { name: n, error: "Unknown operation or not allowed for this connection." }
        })
        return text(out.length === 1 ? out[0] : out)
      }
      const risk = name === "roots_read" ? "read" : name === "roots_write" ? "write" : name === "roots_danger" ? "danger" : null
      if (!risk) return text({ error: `Unknown tool ${name}.` }, true)
      // Several calls at once (reads/writes only, in order; each reports its own result or error).
      if (Array.isArray(a.calls) && risk !== "danger") {
        const results = []
        for (const c of a.calls.slice(0, 25) as Record<string, unknown>[]) results.push(await runOne(risk, c).catch(fail))
        return text({ results })
      }
      const r = await runOne(risk, a)
      const failed = !!r && typeof r === "object" && "error" in r
      const out = text(r, failed)
      // The record's picture comes along as an image, so Claude can see it.
      return failed ? out : { ...out, content: [...out.content, ...(await imagesOf(r).catch(() => []))] }
    } catch (e) {
      if (e instanceof ApiError) return text({ error: { code: e.code, message: e.message, details: e.details } }, true)
      console.error("mcp", e)
      return text({ error: { code: "internal", message: "Something went wrong." } }, true)
    }
  })
  return server
}
