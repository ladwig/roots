// Some MCP clients look for the authorization server metadata on the resource's own host: hand them Supabase Auth's.
export async function GET() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`, { next: { revalidate: 3600 } })
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } })
}
