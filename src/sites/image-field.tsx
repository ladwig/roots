"use client"

import { useRef, useState, useTransition } from "react"
import { ImageIcon, Loader2Icon, XIcon } from "lucide-react"
import { useT } from "@/i18n/client"
import { imageUrl } from "@/lib/images"
import { uploadSiteImage } from "./actions"

/** Puck custom field: pick an image → uploaded to the org's site folder; the value is the storage path. */
export function ImageField({ id, value, onChange, readOnly }: { id: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const pick = (file: File | undefined) => {
    if (!file) return
    const fd = new FormData()
    fd.set("file", file)
    setError("")
    start(async () => {
      const r = await uploadSiteImage(fd)
      if (r.path) onChange(r.path)
      else setError(r.error ?? "")
    })
  }
  return (
    <div className="grid gap-2">
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded image */}
          <img src={imageUrl(value)} alt="" className="aspect-[16/10] w-full rounded-md bg-muted object-cover" />
          {!readOnly && (
            <button type="button" onClick={() => onChange("")} aria-label={t("sites.removeImage")} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full border bg-background">
              <XIcon size={14} />
            </button>
          )}
        </div>
      ) : null}
      {!readOnly && (
        <button
          type="button"
          id={id}
          onClick={() => input.current?.click()}
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed px-2.5 py-2 text-[13px] hover:bg-muted disabled:opacity-60"
        >
          {pending ? <Loader2Icon size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          {value ? t("sites.replaceImage") : t("sites.uploadImage")}
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
