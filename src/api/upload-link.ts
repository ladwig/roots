// Upload links: for clients that can't send file bytes themselves (Claude in the browser sees a pasted picture but
// can't pass the file on). The connection asks for a link to one target; the person opens /upload/<token> and drops
// the file there, or a client with a shell PUTs the bytes to /api/upload/<token>. The token is signed and short-lived
// and runs the upload as that key / AI connection with its live rights, through the normal endpoints:
//   image target: PUT <image endpoint> (e.g. /events/{id}/image), raw body
//   file target:  POST /files/uploads → store bytes → POST /files { path, name, entity/entity_id | folder }
import { createHmac, timingSafeEqual } from "node:crypto"
import { connectionAuth } from "@/mcp/oauth"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import { MAX_FILE_BYTES } from "@/lib/files"
import { ApiError, allowed, invoke, match, parseInput, type Auth, type Endpoint } from "./core"

const TTL_MS = 60 * 60 * 1000
// Vercel function bodies are limited to 4.5 MB.
// ponytail: bigger documents would need the browser to PUT straight to a signed Storage URL; add when someone needs it.
export const MAX_LINK_BYTES = Math.min(MAX_FILE_BYTES, 4 * 1024 * 1024)

export type Target = { kind: "image"; path: string; label?: string } | { kind: "file"; entity?: string; entity_id?: string; folder?: string; label?: string }
type Payload = { o: string; k: string; t: Target; x: number }

const secret = () => process.env.MCP_CONFIRM_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? "dev"
const sig = (data: string) => createHmac("sha256", secret()).update(`upload:${data}`).digest("base64url")

export function uploadLink(auth: Pick<Auth, "org_id" | "key_id">, t: Target) {
  const x = Date.now() + TTL_MS
  const data = Buffer.from(JSON.stringify({ o: auth.org_id, k: auth.key_id, t, x } satisfies Payload)).toString("base64url")
  return { upload_url: `${APP_URL}/upload/${data}.${sig(data)}`, expires_at: new Date(x).toISOString() }
}

export function readToken(token: string): Payload | null {
  const [data, s] = token.split(".")
  if (!data || !s) return null
  const want = Buffer.from(sig(data))
  const got = Buffer.from(s)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  const p = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload
  return p.x > Date.now() ? p : null
}

// The key / connection behind the link, with its rights now (revoked, expired or removed → 401).
async function liveAuth(p: Payload): Promise<Auth> {
  const db = createAdminClient()
  let auth: Auth | null = null
  if (p.k.startsWith("oauth:")) {
    const { data: conn } = await db.from("mcp_connections").select("id, org_id, access, user_id").eq("id", p.k.slice(6)).maybeSingle()
    if (conn) auth = await connectionAuth(conn)
  } else {
    const { data: key } = await db.from("api_keys").select("key_hash").eq("id", p.k).maybeSingle()
    const { data } = key ? await db.rpc("api_key_auth", { p_hash: key.key_hash }).maybeSingle() : { data: null }
    if (data) auth = { ...data, hash: key!.key_hash }
  }
  if (!auth || auth.org_id !== p.o) throw new ApiError(401, "unauthorized", "This upload link no longer works.")
  return auth
}

const find = (endpoints: Endpoint[], method: string, path: string) => {
  for (const e of endpoints) {
    const params = e.method === method ? match(e.path, path) : null
    if (params) return { e, params }
  }
  throw new ApiError(404, "not_found", "Unknown upload target.")
}

/** Image targets and raw uploads (curl): the request body is the file, X-File-Name its name. */
export async function putUpload(endpoints: Endpoint[], p: Payload, request: Request) {
  const auth = await liveAuth(p)
  if (p.t.kind === "image") {
    const { e, params } = find(endpoints, "PUT", p.t.path)
    allowed(auth, e)
    return invoke(e, auth, { params, query: {}, body: {} }, request)
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_LINK_BYTES) throw tooLarge()
  const name = decodeURIComponent(request.headers.get("x-file-name") ?? "") || "upload"
  const bytes = await request.arrayBuffer()
  if (!bytes.byteLength) throw new ApiError(400, "file_missing", "Send the file as the request body.")
  if (bytes.byteLength > MAX_LINK_BYTES) throw tooLarge()
  const { path } = await startFile(endpoints, p, name, auth)
  const type = request.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream"
  const { error } = await createAdminClient().storage.from("files").upload(path, bytes, { contentType: type })
  if (error) throw new ApiError(500, "internal", "Storage error.")
  return finishFile(endpoints, p, path, name, auth)
}
const tooLarge = () => new ApiError(413, "too_large", `Max. ${MAX_LINK_BYTES / 1024 / 1024} MB per file here; larger files via the upload page.`)

/** File targets from the upload page, step 1: a signed Storage URL the browser PUTs to (no function size limit). */
export async function startFile(endpoints: Endpoint[], p: Payload, name: string, auth?: Auth) {
  if (p.t.kind !== "file") throw new ApiError(400, "invalid_input", "Not a file link.")
  auth ??= await liveAuth(p)
  const start = find(endpoints, "POST", "/files/uploads")
  allowed(auth, start.e)
  const input = parseInput(start.e, { query: {}, body: { name } })
  return (await invoke(start.e, auth, { params: {}, query: {}, body: input.body }, new Request(APP_URL))) as { path: string; upload_url: string; token: string }
}

/** Step 2: register the stored file on the link's record / folder (POST /files checks path, size and record). */
export async function finishFile(endpoints: Endpoint[], p: Payload, path: string, name: string, auth?: Auth) {
  if (p.t.kind !== "file") throw new ApiError(400, "invalid_input", "Not a file link.")
  auth ??= await liveAuth(p)
  const register = find(endpoints, "POST", "/files")
  allowed(auth, register.e)
  const { entity, entity_id, folder } = p.t
  const input = parseInput(register.e, { query: {}, body: { path, name, ...(entity ? { entity, entity_id } : folder ? { folder } : {}) } })
  return invoke(register.e, auth, { params: {}, query: {}, body: input.body }, new Request(APP_URL))
}
