"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { finishAudioUpload, startAudioUpload } from "../actions"

/**
 * Masters (WAV/AIFF/FLAC) go from the browser straight to the audio storage (R2, signed PUT link; no size limit of our
 * server in between), one after another with progress. Then the server queues the conversion and the page reloads.
 */
export function AudioUpload({ productId }: { productId: string }) {
  const t = useT()
  const router = useRouter()
  const [progress, setProgress] = useState<{ name: string; pct: number }[]>([])
  const busy = progress.length > 0

  const put = (url: string, file: File, onPct: (p: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", url)
      xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100))
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))))
      xhr.onerror = () => reject(new Error("network"))
      xhr.send(file)
    })

  async function upload(files: File[]) {
    setProgress(files.map((f) => ({ name: f.name, pct: 0 })))
    for (const [i, file] of files.entries()) {
      const set = (pct: number) => setProgress((p) => p.map((x, j) => (j === i ? { ...x, pct } : x)))
      try {
        const start = await startAudioUpload(productId, file.name, file.size)
        if ("error" in start) throw new Error(start.error)
        await put(start.url, file, set)
        const done = await finishAudioUpload(start.id)
        if (done.error) throw new Error(done.error)
        set(100)
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error && e.message.length > 3 ? e.message : t("store.audioUploadFailed")}`)
      }
    }
    setProgress([])
    router.refresh()
  }

  return (
    <div className="grid gap-2">
      <Button render={<label />} nativeButton={false} variant="outline" size="sm" className="justify-self-start" aria-disabled={busy}>
        <UploadIcon /> {t("store.audioUpload")}
        <input
          type="file"
          multiple
          accept=".wav,.aif,.aiff,.flac,audio/wav,audio/x-wav,audio/aiff,audio/flac"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ""
            if (files.length) upload(files)
          }}
        />
      </Button>
      <p className="text-xs text-muted-foreground">{t("store.audioUploadHint")}</p>
      {progress.map((p) => (
        <div key={p.name} className="grid gap-1 text-xs">
          <span className="truncate">{p.name}</span>
          <progress value={p.pct} max={100} className="h-1.5 w-full accent-primary" aria-label={p.name} />
        </div>
      ))}
    </div>
  )
}
