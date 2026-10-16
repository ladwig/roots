// Images over MCP. Upload: upload endpoints (PUT /events/{id}/image …) take `image_url` (https, fetched here) or
// `image_base64` (optionally a data: URL) instead of a raw body. Show: results carrying an image link from our own
// storage get the picture attached as MCP image content, so Claude sees what it uploaded / what a record shows.
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { ApiError } from "@/api/core"
import { MAX_IMAGE_BYTES } from "@/lib/images"

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export const UPLOAD_INPUT = {
  image_url: { type: "string", description: "https link to the picture (JPEG, PNG, WebP or GIF, max. 2 MB)" },
  image_base64: { type: "string", description: "Or the picture itself, base64 (or a data: URL)" },
  content_type: { type: "string", description: "With image_base64: image/jpeg, image/png, image/webp or image/gif" },
}

// No fetching into private networks (SSRF): every hop's host must resolve to public addresses only.
function privateIp(ip: string) {
  if (ip.includes(":")) return /^(::1?|f[cd]|fe[89ab]|::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip) || ip === "::"
  const [a, b] = ip.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}
async function publicUrl(raw: string) {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ApiError(422, "image_url", "image_url is not a valid link.")
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new ApiError(422, "image_url", "image_url must be an https link.")
  const host = u.hostname.replace(/^\[|\]$/g, "")
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((x) => x.address)
  if (!ips.length || ips.some(privateIp)) throw new ApiError(422, "image_url", "image_url can't be reached.")
  return u
}
// ponytail: DNS is checked before fetch, not pinned; a rebinding host could still slip through. Pin the IP (undici dispatcher) if this ever matters.

async function readLimited(res: Response) {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new ApiError(413, "image_too_large", "Max. 2 MB.")
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel()
      throw new ApiError(413, "image_too_large", "Max. 2 MB.")
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

async function download(raw: string) {
  let url = await publicUrl(raw)
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "roots-image-fetch/1.0 (+https://roots-berlin.vercel.app)" }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (!res) throw new ApiError(422, "image_url", "image_url can't be reached.")
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await publicUrl(new URL(res.headers.get("location")!, url).toString())
      continue
    }
    if (!res.ok) throw new ApiError(422, "image_url", `image_url answered ${res.status}.`)
    return { bytes: await readLimited(res), type: res.headers.get("content-type")?.split(";")[0].trim() ?? "" }
  }
  throw new ApiError(422, "image_url", "Too many redirects.")
}

/** The upload as the raw-body request the endpoint expects (its own checks for type and size still apply). */
export async function uploadRequest(args: Record<string, unknown>, method: string) {
  let bytes: Buffer
  let type: string
  if (typeof args.image_url === "string" && args.image_url) ({ bytes, type } = await download(args.image_url))
  else if (typeof args.image_base64 === "string" && args.image_base64) {
    const m = /^data:([\w/+.-]+);base64,([\s\S]*)$/.exec(args.image_base64)
    bytes = Buffer.from(m ? m[2] : args.image_base64, "base64")
    type = m?.[1] ?? String(args.content_type ?? "")
    if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, "image_too_large", "Max. 2 MB.")
  } else throw new ApiError(400, "image_missing", "Pass image_url or image_base64.")
  if (!TYPES.includes(type)) throw new ApiError(415, "image_type", "Use JPEG, PNG, WebP or GIF.")
  return new Request("http://mcp.local/upload", { method, headers: { "content-type": type, "content-length": String(bytes.length) }, body: new Uint8Array(bytes) })
}

/** Pictures of a single-record result (image_url fields pointing at our public images bucket), max. 3. */
export async function imagesOf(result: unknown) {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/`
  const urls: string[] = []
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 2 || urls.length >= 3) return
    if (Array.isArray(v)) return // lists stay text (could be hundreds)
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "string" && /(^|_)(image|logo|picture|avatar)_url$/.test(k) && x.startsWith(base) && !urls.includes(x)) urls.push(x)
      else walk(x, depth + 1)
    }
  }
  walk(result, 0)
  const out = await Promise.all(
    urls.map(async (u) => {
      const res = await fetch(u, { signal: AbortSignal.timeout(5000) }).catch(() => null)
      const type = res?.headers.get("content-type")?.split(";")[0].trim() ?? ""
      if (!res?.ok || !TYPES.includes(type)) return null
      const bytes = await readLimited(res).catch(() => null)
      return bytes ? { type: "image" as const, data: bytes.toString("base64"), mimeType: type } : null
    }),
  )
  return out.filter((x) => x !== null)
}
