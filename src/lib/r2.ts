// Cloudflare R2 (S3 API): roots' storage for big private files (today: shop music under audio/…; anything that is too
// big or too download-heavy for Supabase Storage can live here under its own prefix). Private bucket: access only via
// short-lived signed links. No "@/" imports: runnable with plain node for checks.
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { createReadStream } from "node:fs"
import { AwsClient } from "aws4fetch"

const client = () => new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" })
const url = (key: string) => `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`
export const r2Ready = () => !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET)

/** A link the browser can use directly: GET (optionally as a download with a file name) or PUT (upload). */
export async function presign(key: string, method: "GET" | "PUT", seconds: number, download?: string) {
  const u = new URL(url(key))
  u.searchParams.set("X-Amz-Expires", String(seconds))
  if (download) u.searchParams.set("response-content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download)}`)
  return (await client().sign(u.toString(), { method, aws: { signQuery: true } })).url
}

export async function headSize(key: string): Promise<number | null> {
  const res = await client().fetch(url(key), { method: "HEAD" })
  return res.ok ? Number(res.headers.get("content-length")) : null
}

export async function removeKeys(keys: string[]) {
  await Promise.all(keys.map((k) => client().fetch(url(k), { method: "DELETE" })))
}

/**
 * Upload from any byte stream without knowing its length (ZIPs, big files): multipart in 16 MB parts, so memory stays
 * small. Returns the size.
 */
export async function uploadStream(key: string, chunks: AsyncIterable<Uint8Array>, contentType: string): Promise<number> {
  const r2 = client()
  const start = await r2.fetch(`${url(key)}?uploads`, { method: "POST", headers: { "content-type": contentType } })
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await start.text())?.[1]
  if (!start.ok || !uploadId) throw new Error(`r2 multipart start failed (${start.status})`)
  const etags: string[] = []
  let size = 0
  let buf: Uint8Array[] = []
  let buffered = 0
  const flush = async () => {
    const part = Buffer.concat(buf)
    buf = []
    buffered = 0
    const res = await r2.fetch(`${url(key)}?partNumber=${etags.length + 1}&uploadId=${encodeURIComponent(uploadId)}`, { method: "PUT", body: part })
    if (!res.ok) throw new Error(`r2 part upload failed (${res.status})`)
    etags.push(res.headers.get("etag")!)
  }
  try {
    for await (const c of chunks) {
      buf.push(c)
      buffered += c.length
      size += c.length
      if (buffered >= 16 * 1024 * 1024) await flush()
    }
    if (buffered || !etags.length) await flush()
    const xml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join("")}</CompleteMultipartUpload>`
    const done = await r2.fetch(`${url(key)}?uploadId=${encodeURIComponent(uploadId)}`, { method: "POST", body: xml })
    if (!done.ok) throw new Error(`r2 multipart complete failed (${done.status})`)
    return size
  } catch (e) {
    await r2.fetch(`${url(key)}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE" }).catch(() => {})
    throw e
  }
}

export const uploadFile = (key: string, path: string, contentType: string) => uploadStream(key, createReadStream(path, { highWaterMark: 4 * 1024 * 1024 }), contentType)
