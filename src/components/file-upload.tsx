"use client"

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { registerFiles, type UploadedFile } from "@/app/(app)/files/actions"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { MAX_FILE_BYTES } from "@/lib/files"
import { createClient } from "@/lib/supabase/client"

// Resize photos to at most 2000 px and re-encode as WebP, but only keep the result when it is smaller.
// GIFs (animation) and SVGs stay as they are.
async function compress(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" })
  } catch {
    return file
  }
}

/** Upload button for any record (entity + entityId) or the Files page (folder). Uploads go straight to Storage. */
export function FileUpload({ orgId, entity, entityId, folder }: { orgId: string; entity?: string; entityId?: string; folder?: string }) {
  const t = useT()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()

  const upload = (list: FileList | null) => {
    const files = [...(list ?? [])]
    if (!files.length) return
    start(async () => {
      const supabase = createClient()
      const done: UploadedFile[] = []
      for (const original of files) {
        const file = await compress(original)
        if (file.size > MAX_FILE_BYTES) {
          toast.error(t("files.tooLarge", { name: file.name }))
          continue
        }
        const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin"
        const path = `orgs/${orgId}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from("files").upload(path, file, { contentType: file.type || "application/octet-stream" })
        if (error) toast.error(t("files.uploadFailed", { name: file.name }))
        else done.push({ name: file.name, path, mime: file.type, size: file.size })
      }
      if (input.current) input.current.value = ""
      if (!done.length) return
      const r = await registerFiles(done, { entity, entityId, folder })
      if (r.error) toast.error(r.error)
      else toast.success(t("files.uploaded", { count: done.length }))
      router.refresh()
    })
  }

  return (
    <>
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
        {pending ? t("files.uploading") : t("files.upload")}
      </Button>
    </>
  )
}
