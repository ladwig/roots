import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { ApiError, authenticate } from "@/api/core"
import { APP_URL } from "@/lib/url"
import { authenticateOAuth } from "@/mcp/oauth"
import { mcpServer } from "@/mcp/server"

// Remote MCP endpoint (Streamable HTTP, stateless: one short POST per call, no sessions, no SSE). Auth: an API key
// (Bearer roots_…, Claude Code / scripts) or an OAuth access token from Supabase Auth (Claude Desktop / claude.ai,
// approved on /oauth/consent). Without one: 401 pointing to the protected-resource metadata, which starts sign-in.
export const maxDuration = 60

export async function POST(request: Request) {
  if (process.env.MCP_ENABLED === "false") return Response.json({ error: "MCP is switched off." }, { status: 503 })
  let auth
  try {
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/)?.[1] ?? ""
    auth = bearer.startsWith("roots_") || !bearer ? await authenticate(request) : await authenticateOAuth(bearer)
  } catch (e) {
    const message = e instanceof ApiError ? e.message : "Unauthorized."
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
      { status: e instanceof ApiError && e.status === 403 ? 403 : 401, headers: { "www-authenticate": `Bearer resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/api/mcp"` } },
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await mcpServer(auth, request).connect(transport)
  return transport.handleRequest(request)
}

const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } })
export const GET = notAllowed
export const DELETE = notAllowed
