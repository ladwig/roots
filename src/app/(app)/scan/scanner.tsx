"use client"

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { CameraIcon, CameraOffIcon, CloudOffIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { checkIn, scanList, syncCheckIns, type ScanEntry, type ScanResult } from "./actions"

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }

// Camera QR scanning: native BarcodeDetector (Chrome/Android) or jsQR (Safari/iPhone), plus typing the code.
// Offline: the ticket list is kept on the device (localStorage); without connection codes are checked against it and
// check-ins queue up until the device is online again. ponytail: two offline devices can both let in the same ticket
// (reported as conflict on sync); the page must stay open (no service worker yet).
type Store = { list: Record<string, ScanEntry>; at: string; queue: string[] }
const KEY = (eventId: string) => `roots-scan-${eventId}`
const load = (eventId: string): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY(eventId)) ?? "") as Store
  } catch {
    return { list: {}, at: "", queue: [] }
  }
}
const save = (eventId: string, s: Store) => {
  try {
    localStorage.setItem(KEY(eventId), JSON.stringify(s))
  } catch {}
}
export function Scanner({ eventId }: { eventId: string }) {
  const t = useT()
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState(false)
  const [last, setLast] = useState<(ScanResult & { code: string }) | null>(null)
  const [pending, start] = useTransition()
  const busy = useRef(false)
  const recent = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const [store, setStore] = useState<Store>({ list: {}, at: "", queue: [] })
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb)
      window.addEventListener("offline", cb)
      return () => {
        window.removeEventListener("online", cb)
        window.removeEventListener("offline", cb)
      }
    },
    () => navigator.onLine,
    () => true,
  )
  const [syncNote, setSyncNote] = useState("")
  const update = (next: Store) => {
    save(eventId, next)
    setStore(next)
  }

  async function refresh() {
    try {
      const list = await scanList(eventId)
      const cur = load(eventId)
      // Keep local check-ins that haven't been synced yet.
      const map = Object.fromEntries(list.map((e) => [e.code, cur.queue.includes(e.code) ? { ...e, status: "used" as const } : e]))
      update({ list: map, at: new Date().toISOString(), queue: cur.queue })
    } catch {}
  }

  async function sync() {
    const cur = load(eventId)
    if (!cur.queue.length) return
    try {
      const r = await syncCheckIns(eventId, cur.queue)
      update({ ...load(eventId), queue: [] })
      setSyncNote(t("tickets.synced", { count: r.synced }) + (r.conflicts.length ? ` · ${t("tickets.conflicts", { codes: r.conflicts.join(", ") })}` : ""))
    } catch {}
  }

  useEffect(() => {
    const on = () => sync().then(refresh)
    window.addEventListener("online", on)
    Promise.resolve().then(() => setStore(load(eventId))).then(on) // device list first, then server
    const timer = setInterval(() => navigator.onLine && on(), 60_000)
    return () => {
      window.removeEventListener("online", on)
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per event
  }, [eventId])

  // No connection: decide on the device and queue the check-in.
  function checkLocally(code: string): ScanResult {
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    const cur = load(eventId)
    const e = cur.list[clean]
    if (!e) return { result: "invalid" }
    if (e.status === "used") return { result: "used", holder: e.holder, type: e.type }
    update({ ...cur, list: { ...cur.list, [clean]: { ...e, status: "used" } }, queue: [...cur.queue, clean] })
    return { result: "ok", holder: e.holder, type: e.type, at: new Date().toISOString() }
  }

  function submit(code: string) {
    const now = Date.now()
    if (busy.current || (code === recent.current.code && now - recent.current.at < 4000)) return // same QR still in view
    busy.current = true
    recent.current = { code, at: now }
    start(async () => {
      let r: ScanResult
      try {
        r = navigator.onLine ? await checkIn(eventId, code) : checkLocally(code)
        if (r.result === "error" && !navigator.onLine) r = checkLocally(code)
      } catch {
        r = checkLocally(code) // request failed (bad venue Wi-Fi): fall back to the device list
      }
      if (r.result === "ok" || r.result === "used") {
        const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
        const cur = load(eventId)
        if (cur.list[clean]?.status === "valid") update({ ...cur, list: { ...cur.list, [clean]: { ...cur.list[clean], status: "used" } } })
      }
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

  const count = Object.keys(store.list).length
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {!online && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">
            <CloudOffIcon className="size-3.5" /> {t("tickets.offline")}
          </span>
        )}
        <span>
          {store.at ? t("tickets.listInfo", { count, time: t.date(store.at, { timeStyle: "short" }) }) : t("tickets.listLoading")}
          {store.queue.length > 0 && ` · ${t("tickets.queued", { count: store.queue.length })}`}
        </span>
        <Button type="button" size="xs" variant="ghost" onClick={() => sync().then(refresh)} aria-label={t("tickets.refreshList")}>
          <RefreshCwIcon />
        </Button>
        {syncNote && <span>{syncNote}</span>}
      </div>
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
