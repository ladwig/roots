"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { CameraIcon, CameraOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { checkIn, type ScanResult } from "./actions"

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }

// Camera QR scanning: native BarcodeDetector (Chrome/Android) or jsQR (Safari/iPhone), plus typing the code.
export function Scanner({ eventId }: { eventId: string }) {
  const t = useT()
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState(false)
  const [last, setLast] = useState<(ScanResult & { code: string }) | null>(null)
  const [pending, start] = useTransition()
  const busy = useRef(false)
  const recent = useRef<{ code: string; at: number }>({ code: "", at: 0 })

  function submit(code: string) {
    const now = Date.now()
    if (busy.current || (code === recent.current.code && now - recent.current.at < 4000)) return // same QR still in view
    busy.current = true
    recent.current = { code, at: now }
    start(async () => {
      const r = await checkIn(eventId, code)
      setLast({ ...r, code })
      navigator.vibrate?.(r.result === "ok" ? 80 : [80, 60, 80])
      busy.current = false
    })
  }

  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | undefined
    let stop = false
    const canvas = document.createElement("canvas")
    ;(async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      const v = video.current!
      v.srcObject = stream
      await v.play()
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
      const native = Native ? new Native({ formats: ["qr_code"] }) : null
      const jsQR = native ? null : (await import("jsqr")).default
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      while (!stop) {
        if (v.readyState >= 2) {
          let value: string | undefined
          if (native) value = (await native.detect(v))[0]?.rawValue
          else {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            ctx.drawImage(v, 0, 0)
            value = jsQR!(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data
          }
          if (value) submit(value)
        }
        await new Promise((r) => setTimeout(r, 200))
      }
    })().catch(() => setCamera(false))
    return () => {
      stop = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is stable enough (refs + transition)
  }, [camera])

  const tone = last?.result === "ok" ? "border-primary bg-primary/15" : last?.result === "used" ? "border-border bg-muted" : "border-destructive bg-destructive/10"

  return (
    <div className="grid gap-4">
      {last && (
        <div role="status" aria-live="assertive" className={cn("grid gap-1 rounded-xl border-2 p-4", tone)}>
          <p className="text-2xl font-semibold">{t.dynamic(`tickets.scanResult.${last.result}`)}</p>
          <p className="font-mono text-sm">{last.code}</p>
          {(last.holder || last.type) && <p>{[last.holder, last.type].filter(Boolean).join(" · ")}</p>}
          {last.result === "used" && last.at && (
            <p className="text-sm text-muted-foreground">{t("tickets.usedAt", { time: t.date(last.at, { timeStyle: "short" }) })}</p>
          )}
          {last.message && <p className="text-sm">{last.message}</p>}
        </div>
      )}
      <div className="grid gap-2">
        <Button type="button" variant={camera ? "outline" : "default"} onClick={() => setCamera((c) => !c)} className="justify-self-start">
          {camera ? <CameraOffIcon /> : <CameraIcon />} {camera ? t("tickets.cameraOff") : t("tickets.cameraOn")}
        </Button>
        {camera && <video ref={video} muted playsInline className="aspect-square w-full max-w-sm rounded-xl border bg-muted object-cover" />}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = e.currentTarget
          const code = new FormData(f).get("code")
          recent.current = { code: "", at: 0 }
          if (code) submit(String(code))
          f.reset()
        }}
        className="flex flex-wrap gap-2"
      >
        <Input name="code" placeholder={t("tickets.codePlaceholder")} aria-label={t("tickets.code")} autoComplete="off" className="w-48 font-mono uppercase" />
        <Button type="submit" disabled={pending} variant="outline">
          {t("tickets.checkIn")}
        </Button>
      </form>
    </div>
  )
}
