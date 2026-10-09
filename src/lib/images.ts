// Profile pictures and org logos in the public "images" bucket (see migration 20261010100000_images).
// The DB stores the path; build the URL with imageUrl(). Bucket enforces type + 2 MB; RLS who may write.
import type { SupabaseClient } from "@supabase/supabase-js"

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export const imageUrl = (path?: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/${path}` : undefined

// Uploads under <folder>/ with a random name, removes the previous file. Returns the new path or an error code.
// ponytail: no resizing; images are shown small. Add a transform (Supabase image transforms or sharp) if pages get heavy.
export async function replaceImage(supabase: SupabaseClient, folder: string, file: unknown, previous?: string | null) {
  if (!(file instanceof File) || !file.size) return { error: "image_missing" as const }
  const ext = TYPES[file.type]
  if (!ext) return { error: "image_type" as const }
  if (file.size > MAX_IMAGE_BYTES) return { error: "image_too_large" as const }
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from("images").upload(path, file, { contentType: file.type, cacheControl: "31536000" })
  if (error) return { error: "not_allowed" as const }
  if (previous) await supabase.storage.from("images").remove([previous])
  return { path }
}

// ponytail: files of purged orgs / deleted users stay in the bucket; sweep orgs/<id>/ + users/<id>/ in the purge cron if storage grows.
export async function removeImage(supabase: SupabaseClient, path?: string | null) {
  if (path) await supabase.storage.from("images").remove([path])
}
