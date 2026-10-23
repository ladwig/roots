"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { useT } from "@/i18n/client"
import { autosaveWebsiteDraft } from "./actions"

/**
 * Inside a Website form: saves the draft a moment after the last change and refreshes the page, so the preview and
 * the "unpublished changes" bar follow. Inputs keep what's typed (they're uncontrolled or client state).
 */
export function AutoSave() {
  const t = useT()
  const router = useRouter()
  const ref = useRef<HTMLSpanElement>(null)
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const form = () => ref.current?.closest("form") ?? null
    const save = async () => {
      const f = form()
      if (!f) return
      setState("saving")
      const r = await autosaveWebsiteDraft(new FormData(f)).catch(() => ({ ok: false }))
      setState(r.ok ? "saved" : "error")
      if (r.ok) router.refresh()
    }
    const changed = (e: Event) => {
      if (!(e.target instanceof Node) || !form()?.contains(e.target)) return
      clearTimeout(timer)
      timer = setTimeout(save, 1200)
    }
    document.addEventListener("input", changed, true)
    document.addEventListener("change", changed, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("input", changed, true)
      document.removeEventListener("change", changed, true)
    }
  }, [router])
  return (
    <span ref={ref} aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" && (
        <>
          <Loader2Icon className="size-3.5 animate-spin" /> {t("website.autosave.saving")}
        </>
      )}
      {state === "saved" && (
        <>
          <CheckIcon className="size-3.5" /> {t("website.autosave.saved")}
        </>
      )}
      {state === "error" && <span className="text-destructive">{t("website.autosave.error")}</span>}
      {state === "idle" && t("website.autosave.idle")}
    </span>
  )
}
