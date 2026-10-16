import { ApiError, error, json } from "@/api/core"
import { finishFile, putUpload, readToken, startFile } from "@/api/upload-link"
import { endpoints } from "@/api/v1"

// Upload links (src/api/upload-link.ts). PUT = the file as the body (image targets, small files, curl);
// POST { step: "start", name } → signed Storage URL, then { step: "finish", path, name } (the upload page, any size).
export const maxDuration = 60

async function run(params: Promise<{ token: string }>, fn: (p: NonNullable<ReturnType<typeof readToken>>) => Promise<unknown>) {
  const p = readToken((await params).token)
  if (!p) return error(new ApiError(401, "link_expired", "This upload link has expired. Ask for a new one."))
  try {
    return json(200, await fn(p))
  } catch (e) {
    if (e instanceof ApiError) return error(e)
    console.error("upload link", e)
    return error(new ApiError(500, "internal", "Upload failed."))
  }
}

export function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return run(params, (p) => putUpload(endpoints, p, request))
}

export function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return run(params, async (p) => {
    const body = (await request.json().catch(() => ({}))) as { step?: string; name?: string; path?: string }
    const name = String(body.name ?? "").slice(0, 255) || "upload"
    if (body.step === "start") return startFile(endpoints, p, name)
    if (body.step === "finish") return finishFile(endpoints, p, String(body.path ?? ""), name)
    throw new ApiError(400, "invalid_input", "step must be start or finish.")
  })
}
