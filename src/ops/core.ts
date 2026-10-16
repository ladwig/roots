// Operations: every key-API endpoint as a named operation (read / write / danger) with one flat input object. Shared by
// the MCP server (Claude & co. from outside) and Sprout, the in-App assistant: same names, same checks
// (allowed → parseInput → rateLimit → invoke), same App links. Danger needs a confirmation; how is up to the caller
// (MCP: confirm token, Sprout: approval card in the chat).
import { z } from "zod"
import { ApiError, invoke, mayCall, parseInput, rateLimit, type Auth, type Endpoint } from "@/api/core"
import { endpoints } from "@/api/v1"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import { imagesOf, UPLOAD_INPUT, uploadRequest } from "@/mcp/media"
import { uploadLink } from "@/api/upload-link"
import { appPath, callArgs, opName, riskOf, uniqueNames, type Risk } from "@/mcp/names"

export type { Risk }
export type Op = { name: string; e: Endpoint; risk: Risk; params: string[] }

export const OPS: Op[] = (() => {
  const usable = endpoints
  const names = uniqueNames(usable.map((e) => opName(e.method, e.path)))
  return usable.map((e, i) => ({ name: names[i], e, risk: riskOf(e.method, e.path), params: [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) }))
})()

const schemaOf = (s: z.ZodType | undefined) => (s ? (z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, unknown>; required?: string[] }) : null)

/** One flat input object: path params + query + body fields (body nested under "body" if names clash). */
export function inputSchema(op: Op) {
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

export function split(op: Op, args: Record<string, unknown>) {
  const params: Record<string, string> = {}
  for (const p of op.params) params[p] = String(args[p] ?? "")
  const queryKeys = Object.keys(schemaOf(op.e.query)?.properties ?? {})
  const query = Object.fromEntries(Object.entries(args).filter(([k]) => queryKeys.includes(k)))
  const b = schemaOf(op.e.body)
  const body = b && "body" in inputSchema(op).properties && !Object.keys(b.properties ?? {}).includes("body") ? args.body : Object.fromEntries(Object.entries(args).filter(([k]) => !op.params.includes(k) && !queryKeys.includes(k)))
  return { params, query, body: op.e.body ? body : undefined }
}


export const INSTRUCTIONS = `roots is the back office of a club / collective / small org (contacts, memberships and dues, events and tickets, shifts, invoices, email, forms, automations, rentals …).
How to work (fewer round trips = faster): 1) roots_find_operations to see what this connection may do (filter by a word like "contact" or "rental"), 2) roots_describe_operation for the input schema (pass names: [...] to get several at once), 3) call it with roots_read (GET), roots_write (create/change) or roots_danger (delete, send emails, money, irreversible – first call returns a preview + confirm_token; show the preview to the user and only repeat the call with the token after they agree). For several creates/changes use calls: [{ operation, arguments }, …] in one roots_write. Results of single records carry app_url: link it so the user can open the record in roots.
Pictures and files: upload operations (e.g. the event picture) take image_url (https) or image_base64. A picture or document the person pasted into the chat can't be passed on directly: call the upload operation without image_url/image_base64 (or files_upload_link for documents) and give the person the returned upload_url as a link; they drop the file there. Records with a picture return it as an image. Guided setups are available as prompts (verein_einrichten, mitglieder_importieren, event_erstellen).
Automations: GET workflows_catalog_list (with trigger=…) for triggers, node types and fields → draft a graph (positions optional) → workflows_validate until problems is empty → workflows_create (created inactive) → summarise it for the user → workflows_update { active: true } once they agree. workflow_templates_list has ready-made graphs.
Conventions: money in cents (integer), timestamps ISO 8601 (UTC), days YYYY-MM-DD, the org's time zone is Europe/Berlin. Lists take limit/offset and return has_more. Deleting usually moves to a trash (restorable for 30 days). German area names: Kontakte = contacts, Mitgliedschaften = memberships, Beiträge = dues, Veranstaltungen = events, Schichten = shifts, Vermietung = rentals, Rechnungen = invoices.`

export const opsFor = (auth: Auth) => OPS.filter((o) => mayCall(auth, o.e))

export function errorOf(e: unknown) {
  if (e instanceof ApiError) return { error: { code: e.code, message: e.message, details: e.details } }
  console.error("ops", e)
  return { error: { code: "internal", message: "Something went wrong." } }
}

export async function whoami(auth: Auth) {
  const { data: org } = await createAdminClient().from("orgs").select("name, slug").eq("id", auth.org_id).maybeSingle()
  return { org, modules: auth.modules, permissions: auth.permissions }
}

export function findOps(auth: Auth, query?: unknown, risk?: unknown) {
  const q = String(query ?? "").toLowerCase()
  return opsFor(auth)
    .filter((o) => (!risk || o.risk === risk) && (!q || `${o.name} ${o.e.summary} ${o.e.tag}`.toLowerCase().includes(q)))
    .map((o) => ({ name: o.name, method: o.e.method, path: o.e.path, summary: o.e.summary, risk: o.risk }))
}

export function describeOps(auth: Auth, names: unknown[]) {
  const ops = opsFor(auth)
  const out = names.slice(0, 10).map((n) => {
    const op = ops.find((o) => o.name === n)
    return op
      ? { name: op.name, method: op.e.method, path: op.e.path, summary: op.e.summary, description: op.e.description, permission: op.e.permission, risk: op.risk, tool: `roots_${op.risk}`, input: inputSchema(op) }
      : { name: n, error: "Unknown operation or not allowed for this connection." }
  })
  return out.length === 1 ? out[0] : out
}

export type RunResult = unknown
/**
 * One operation call: checks risk, validates (wrong input → the expected schema comes along), runs it, adds the App
 * link of the record. `confirmed` = the caller already got the person's OK for a danger call; without it a danger call
 * returns { confirm: true, …, target } (a preview of the record it hits) and does nothing.
 */
export async function runOp(auth: Auth, risk: Risk, a: Record<string, unknown>, request: Request, confirmed: boolean): Promise<RunResult> {
  const op = opsFor(auth).find((o) => o.name === a.operation)
  if (!op) return { error: "Unknown operation or not allowed for this connection. Use roots_find_operations." }
  if (op.risk !== risk) return { error: `${op.name} has risk "${op.risk}": call it with roots_${op.risk}.` }
  const args = callArgs(a)
  const input = split(op, args)
  for (const [k, v] of Object.entries(input.params)) if (k.endsWith("id") && !/^[0-9a-f-]{36}$/.test(v)) return { error: { code: "not_found", message: `${k}: not a valid id.` }, expected: inputSchema(op) }
  let parsed
  try {
    parsed = parseInput(op.e, { query: input.query, body: input.body })
  } catch (e) {
    return { ...errorOf(e), expected: inputSchema(op) }
  }
  if (risk === "danger" && !confirmed) {
    // Preview of the record it hits: DELETE /x/{id} → GET /x/{id}; POST /x/{id}/send → GET /x/{id}.
    const base = op.e.method === "DELETE" ? op.e.path : op.e.path.replace(/\/[a-z-]+$/, "")
    const preview = op.params.length ? OPS.find((x) => x.e.method === "GET" && x.e.path === base) : undefined
    const target = preview && mayCall(auth, preview.e) ? await invoke(preview.e, auth, { params: input.params, query: {}, body: undefined }, request).catch(() => null) : null
    return { confirm: true, operation: op.name, summary: op.e.summary, method: op.e.method, path: op.e.path, arguments: args, target }
  }
  // Upload endpoints without the picture itself → a link for the person (pasted chat images can't be passed on).
  if (op.e.upload && !args.image_url && !args.image_base64) {
    const base = OPS.find((x) => x.e.method === "GET" && x.e.path === op.e.path.replace(/\/[a-z-]+$/, ""))
    const rec = base && mayCall(auth, base.e) ? ((await invoke(base.e, auth, { params: input.params, query: {}, body: undefined }, request).catch(() => null)) as Record<string, unknown> | null) : null
    if (base && !rec) return { error: { code: "not_found", message: "Not found." } }
    const label = rec ? String(rec.title ?? rec.name ?? "") || undefined : undefined
    return { ...uploadLink(auth, { kind: "image", path: Object.entries(input.params).reduce((p, [k, v]) => p.replace(`{${k}}`, v), op.e.path), label }), note: "Give the person this link (as a clickable link): they open it and drop the picture; it is set right away. Then read the record to see it." }
  }
  await rateLimit(auth, op.e.method !== "GET" && risk !== "read")
  // Upload endpoints read a raw body: built from image_url / image_base64.
  const req = op.e.upload ? await uploadRequest(args, op.e.method) : request
  const result = await invoke(op.e, auth, { params: input.params, query: parsed.query, body: parsed.body }, req)
  const link = op.e.method !== "GET" || op.params.length ? appPath(op.e.path, result, input.params) : null
  return link && result && typeof result === "object" ? { ...(result as object), app_url: `${APP_URL}${link}` } : result
}

/** Pictures of a single-record result, as MCP image content (the assistant shows them itself). */
export const resultImages = imagesOf

// Tool descriptions, shared so MCP and Sprout explain the same thing.
export const TOOL_TEXT = {
  whoami: "The organisation this connection works in, its enabled modules and the permissions it has.",
  find: "List what this connection can do in roots: operation name, method, path, summary and risk (read/write/danger). Filter with a word (e.g. 'contact', 'rental', 'automation').",
  describe: "Full description, permission, risk and the JSON input schema of one operation (name) or several at once (names, up to 10).",
  read: "Run an operation with risk 'read' (reading, or checking a draft). Changes nothing.",
  write: "Run a creating/changing operation (risk 'write').",
}
export const OPERATION_INPUT = { operation: { type: "string" as const, description: "Operation name from roots_find_operations" }, arguments: { type: "object" as const, description: "Input as described by roots_describe_operation (path ids, query and body fields in one object)" } }
