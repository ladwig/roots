"use client"

import { useEffect, useRef, useState } from "react"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/**
 * The save row at the end of every form on a page, right-aligned: [Verwerfen] [Speichern]. Edit forms (`label`
 * omitted) show it only once something changed, then it sticks to the bottom of the screen and leaving the page asks
 * first. Create forms pass `always` + their label ("Kontakt anlegen").
 */
export function SaveBar({ label, always }: { label?: string; always?: boolean }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    const form = ref.current?.closest("form")
    if (!form) return
    const change = () => setDirty(true)
    const saved = () => setDirty(false)
    form.addEventListener("input", change)
    form.addEventListener("change", change)
    form.addEventListener("submit", saved)
    return () => {
      form.removeEventListener("input", change)
      form.removeEventListener("change", change)
      form.removeEventListener("submit", saved)
    }
  }, [])
  useEffect(() => {
    if (!dirty || always) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, always])

  const show = always || dirty
  return (
    <div
      ref={ref}
      hidden={!show}
      className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-xl sm:border"
    >
      {dirty && !always && <span className="mr-auto text-sm text-muted-foreground">{t("common.unsaved")}</span>}
      {dirty && (
        // ponytail: reload instead of form.reset(), chips/pickers keep React state that reset() can't reach.
        <Button type="button" variant="ghost" size="sm" onClick={() => window.location.reload()}>
          {t("common.discard")}
        </Button>
      )}
      <SubmitButton size="sm">{label ?? t("common.save")}</SubmitButton>
    </div>
  )
}
