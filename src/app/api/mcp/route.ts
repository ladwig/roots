import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { ApiError, authenticate } from "@/api/core"
import { mcpServer } from "@/mcp/server"

// Remote MCP endpoint (Streamable HTTP, stateless: one short POST per call, no sessions, no SSE). Auth like the key
// API: Authorization: Bearer roots_… (OAuth for Claude Desktop/claude.ai comes on top, see docs/plans/mcp.md).
export const maxDuration = 60

export async function POST(request: Request) {
  if (process.env.MCP_ENABLED === "false") return Response.json({ error: "MCP is switched off." }, { status: 503 })
  let auth
  try {
    auth = await authenticate(request)
  } catch (e) {
    const message = e instanceof ApiError ? e.message : "Unauthorized."
    return Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status: 401, headers: { "www-authenticate": 'Bearer realm="roots"' } })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await mcpServer(auth, request).connect(transport)
  return transport.handleRequest(request)
}

const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } })
export const GET = notAllowed
export const DELETE = notAllowed
