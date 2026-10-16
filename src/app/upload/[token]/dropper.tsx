"use client"

import { useState, useTransition } from "react"
import { CheckIcon, Loader2Icon, UploadIcon } from "lucide-react"
import { compress } from "@/components/file-upload"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

type Done = { name: string; url?: string }

export function Dropper({ token, image, maxBytes }: { token: string; image: boolean; maxBytes: number }) {
  const t = useT()
  const [pending, start] = useTransition()
  const [over, setOver] = useState(false)
  const [done, setDone] = useState<Done[]>([])
  const [error, setError] = useState("")
  const api = `/api/upload/${token}`

  async function one(original: File): Promise<Done> {
    const file = await compress(original)
    if (file.size > maxBytes) throw new Error(t("upload.tooLarge", { name: file.name }))
    const fail = async (r: Response) => {
      const j = await r.json().catch(() => null)
      throw new Error(j?.error?.message ?? t("upload.failed"))
    }
    if (image) {
      const r = await fetch(api, { method: "PUT", headers: { "content-type": file.type }, body: file })
      if (!r.ok) await fail(r)
      return { name: file.name, url: (await r.json()).image_url }
    }
    // Files go straight to Storage (signed URL), then get registered on the record.
    const post = (body: object) => fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const s = await post({ step: "start", name: file.name })
    if (!s.ok) await fail(s)
    const { path, upload_url } = await s.json()
    const up = await fetch(upload_url, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file })
    if (!up.ok) throw new Error(t("upload.failed"))
    const f = await post({ step: "finish", path, name: file.name })
    if (!f.ok) await fail(f)
    return { name: file.name }
  }

  const send = (files: File[]) =>
    start(async () => {
      setError("")
      for (const file of image ? files.slice(0, 1) : files) {
        try {
          const d = await one(file)
          setDone((x) => (image ? [d] : [...x, d]))
        } catch (e) {
          setError(e instanceof Error ? e.message : t("upload.failed"))
        }
      }
    })

  return (
    <div className="grid gap-4">
      <label
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), send([...e.dataTransfer.files]))}
        className={cn(
          "grid cursor-pointer justify-items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
          over ? "border-primary bg-muted" : "border-border hover:bg-muted/50",
          pending && "pointer-events-none opacity-60",
        )}
      >
        {pending ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <UploadIcon className="size-6 text-muted-foreground" />}
        <span className="font-medium">{pending ? t("upload.uploading") : t(image ? "upload.dropImage" : "upload.dropFiles")}</span>
        <span className="text-muted-foreground">{t("upload.hint", { mb: Math.round(maxBytes / 1024 / 1024) })}</span>
        <input type="file" className="sr-only" multiple={!image} accept={image ? "image/png,image/jpeg,image/webp,image/gif" : undefined} disabled={pending} onChange={(e) => send([...(e.target.files ?? [])])} />
      </label>
      {error && <p className="rounded-lg border border-destructive/50 px-4 py-3 text-sm text-destructive">{error}</p>}
      {done.length > 0 && (
        <div className="grid gap-3 rounded-lg border bg-muted px-4 py-3 text-sm">
          {done.map((d, i) => (
            <div key={i} className="grid gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.url && <img src={d.url} alt="" className="max-h-60 rounded-md object-contain" />}
              <span className="flex items-center gap-2">
                <CheckIcon className="size-4 text-primary" /> {d.name}
              </span>
            </div>
          ))}
          <p className="text-muted-foreground">{t("upload.back")}</p>
        </div>
      )}
    </div>
  )
}
