import { APP_URL } from "@/lib/url"

// OAuth protected-resource metadata (RFC 9728) for the MCP endpoint: tells Claude where to sign in (Supabase Auth's
// OAuth 2.1 server of this project). Served at /.well-known/oauth-protected-resource and …/api/mcp.
export function GET() {
  return Response.json(
    {
      resource: `${APP_URL}/api/mcp`,
      authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "roots",
    },
    { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } },
  )
}
