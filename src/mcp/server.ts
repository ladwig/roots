// MCP server over the key API: every endpoint the caller's key may use becomes an "operation" (generated from
// src/api/v1, so it grows with the API). Instead of ~240 tools, Claude gets a few: look up operations, describe one,
// and call it through roots_read / roots_write / roots_danger (split by risk so clients can allow them separately).
// Dangerous calls (delete, emails, money, irreversible) take two steps: a preview with a short-lived confirm token,
// then the same call with that token. Same checks as the HTTP API: authenticate → allowed → parseInput → invoke.
import { createHmac, timingSafeEqual } from "node:crypto"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { ApiError, type Auth } from "@/api/core"
import { describeOps, errorOf, findOps, INSTRUCTIONS, OPERATION_INPUT, runOp, TOOL_TEXT, whoami, type Risk } from "@/ops/core"
import { imagesOf } from "./media"
import { getPrompt, promptList } from "./prompts"
import { callArgs, confirmMessage, confirmWindow } from "./names"

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

/** A fresh server per request (stateless); tools see only what `auth` may call. */
export function mcpServer(auth: Auth, request: Request) {
  const server = new Server({ name: "roots", version: "1.0.0" }, { capabilities: { tools: {}, prompts: {} }, instructions: INSTRUCTIONS })
  const one = OPERATION_INPUT
  const call = {
    type: "object",
    properties: { ...one, calls: { type: "array", maxItems: 25, description: "Several calls at once instead of operation/arguments: [{ operation, arguments }, …] – run in order, each with its own result.", items: { type: "object", properties: one, required: ["operation"] } } },
  }

  const fail = errorOf
  // Danger calls need the confirm token from a first (preview) call; the core does the rest.
  async function runOne(risk: Risk, a: Record<string, unknown>): Promise<unknown> {
    const confirmed = risk === "danger" && typeof a.confirm_token === "string" && tokenOk(a.confirm_token, auth.key_id, String(a.operation), callArgs(a))
    const r = await runOp(auth, risk, a, request, confirmed)
    if (r && typeof r === "object" && "confirm" in r)
      return { ...r, confirm_token: sign(confirmMessage(auth.key_id, String(a.operation), callArgs(a), confirmWindow(Date.now()))), note: "Nothing happened yet. Show this to the user; repeat the same call with confirm_token to execute." }
    return r
  }

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: promptList() }))
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const p = getPrompt(req.params.name, req.params.arguments)
    if (!p) throw new Error(`Unknown prompt ${req.params.name}.`)
    return p
  })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "roots_whoami", title: "Who am I", description: TOOL_TEXT.whoami, inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
      {
        name: "roots_find_operations",
        title: "Find operations",
        description: TOOL_TEXT.find,
        inputSchema: { type: "object", properties: { query: { type: "string", description: "Word to search in names and summaries" }, risk: { type: "string", enum: ["read", "write", "danger"] } } },
        annotations: { readOnlyHint: true },
      },
      {
        name: "roots_describe_operation",
        title: "Describe operations",
        description: TOOL_TEXT.describe,
        inputSchema: { type: "object", properties: { name: { type: "string" }, names: { type: "array", items: { type: "string" } } } },
        annotations: { readOnlyHint: true },
      },
      { name: "roots_read", title: "Read from roots", description: TOOL_TEXT.read, inputSchema: call, annotations: { readOnlyHint: true } },
      { name: "roots_write", title: "Change roots", description: TOOL_TEXT.write, inputSchema: call, annotations: { readOnlyHint: false, destructiveHint: false } },
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
      if (name === "roots_whoami") return text(await whoami(auth))
      if (name === "roots_find_operations") return text(findOps(auth, a.query, a.risk))
      if (name === "roots_describe_operation") return text(describeOps(auth, Array.isArray(a.names) ? a.names : [a.name]))
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
