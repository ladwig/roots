// Shared schemas + helpers for the v1 endpoint files.
import { z } from "zod"
import { MAX_IMAGE_BYTES, replaceImage } from "@/lib/images"
import { ApiError, uploadedImage, type Endpoint } from "../core"

export const ts = z.string().describe("ISO 8601 timestamp")
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD")
export const Custom = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe("Custom fields of the org: { key: value }")
export const berlinToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
export type Db = Parameters<Endpoint["handler"]>[0]["db"]
export const dbFail = () => new ApiError(500, "internal", "Database error.")

// Public images (event picture, org logo): the raw body is the image; same rules + storage as the App's <ImageForm>.
export async function putImage(db: Db, request: Request, folder: string, previous: string | null) {
  const r = await replaceImage(db, folder, await uploadedImage(request, MAX_IMAGE_BYTES), previous)
  if ("path" in r) return r.path
  if (r.error === "image_type") throw new ApiError(415, "image_type", "Use JPEG, PNG, WebP or GIF (Content-Type header).")
  if (r.error === "image_too_large") throw new ApiError(413, "image_too_large", "Max. 2 MB.")
  if (r.error === "image_missing") throw new ApiError(400, "image_missing", "Send the image as the request body.")
  throw new ApiError(500, "internal", "Upload failed.")
}
