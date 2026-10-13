"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/i18n/client"

// A form that saves itself: every input (typing pauses 700 ms, selects/dates/chips at once-ish) posts the whole form to
// `action`, then refreshes the page so the board/list show the change. Pending changes are saved when it closes.
export function AutosaveForm({ action, children, className }: { action: (fd: FormData) => Promise<{ error?: string }>; children: React.ReactNode; className?: string }) {
  const t = useT()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, start] = useTransition()
  const [saved, setSaved] = useState(false)

  const save = (refresh = true) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!form.current?.checkValidity()) return
    const fd = new FormData(form.current)
    start(async () => {
      const r = await action(fd)
      if (r.error) return void toast.error(r.error)
      setSaved(true)
      if (refresh) router.refresh()
    })
  }
  const later = () => {
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(save, 700)
  }
  // Closing the panel with a change still waiting: save it (no refresh needed, the page navigates anyway).
  useEffect(
    () => () => {
      if (timer.current && form.current?.checkValidity()) void action(new FormData(form.current))
    },
    [action],
  )

  return (
    <form ref={form} onInput={later} onSubmit={(e) => (e.preventDefault(), save())} className={className}>
      {children}
      <p className="flex h-4 items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        {saving ? (
          <>
            <Loader2Icon className="size-3 animate-spin" /> {t("projects.saving")}
          </>
        ) : (
          saved && (
            <>
              <CheckIcon className="size-3" /> {t("projects.saved")}
            </>
          )
        )}
      </p>
    </form>
  )
}
