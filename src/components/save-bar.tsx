"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal, useFormStatus } from "react-dom"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/**
 * The only save control of a form: put <SaveBar /> anywhere inside the <form>. Edit forms show no button at all;
 * once something changes, a full-width bar slides in at the bottom of the screen ("Ungespeicherte Änderungen ·
 * Abbrechen · Speichern"), and leaving the page (links in the App, reload, closing the tab) asks first.
 * Create forms pass `always` + their label ("Kontakt anlegen"): the bar is there from the start.
 * In a drawer it sticks to the drawer's bottom instead of the page's.
 */
export function SaveBar({ label, always }: { label?: string; always?: boolean }) {
  const t = useT()
  const ref = useRef<HTMLSpanElement>(null)
  const ownId = useId()
  const [formId, setFormId] = useState<string | null>(null)
  const [target, setTarget] = useState<Element | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const form = ref.current?.closest("form")
    if (!form) return
    if (!form.id) form.id = `form-${ownId.replace(/:/g, "")}`
    setFormId(form.id)
    // Page: a bar across the whole content area (portal to its end). Drawer: inline, sticky inside the drawer.
    setTarget(form.closest("[data-slot=sheet-content]") ? null : document.querySelector("[data-slot=sidebar-inset]"))
    const change = () => setDirty(true)
    form.addEventListener("input", change)
    form.addEventListener("change", change)
    return () => {
      form.removeEventListener("input", change)
      form.removeEventListener("change", change)
    }
  }, [ownId])

  // Unsaved changes: ask before reload/close and before following links inside the App.
  useEffect(() => {
    if (!dirty || always) return
    const unload = (e: BeforeUnloadEvent) => e.preventDefault()
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || a.href.startsWith("mailto:") || a.href.startsWith("tel:")) return
      if (!window.confirm(t("common.leaveUnsaved"))) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", unload)
    document.addEventListener("click", click, true)
    return () => {
      window.removeEventListener("beforeunload", unload)
      document.removeEventListener("click", click, true)
    }
  }, [dirty, always, t])

  const show = always || dirty
  const bar = show && formId && (
    <div
      role="region"
      aria-label={t("common.unsaved")}
      className={
        target
          ? "sticky bottom-0 z-20 mt-auto border-t bg-background/95 shadow-[0_-4px_12px_-6px] shadow-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          : "sticky bottom-0 z-20 -mx-4 mt-2 border-t bg-background/95 backdrop-blur"
      }
    >
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 md:px-8">
        {dirty && !always && <span className="mr-auto text-sm text-muted-foreground">{t("common.unsaved")}</span>}
        {dirty && (
          // ponytail: reload instead of form.reset(), chips/pickers keep React state that reset() can't reach.
          <Button type="button" variant="ghost" size="sm" onClick={() => window.location.reload()}>
            {t("common.cancel")}
          </Button>
        )}
        <Save form={formId} label={label ?? t("common.save")} onDone={() => setDirty(false)} />
      </div>
    </div>
  )
  return (
    <span ref={ref} className="contents">
      {target && bar ? createPortal(bar, target) : bar}
    </span>
  )
}

// Inside the form's React tree (also through the portal), so useFormStatus sees the running action.
function Save({ form, label, onDone }: { form: string; label: string; onDone: () => void }) {
  const { pending } = useFormStatus()
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !pending) onDone()
    was.current = pending
  }, [pending, onDone])
  return (
    <Button type="submit" form={form} size="sm" disabled={pending} aria-busy={pending || undefined}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden />}
      {label}
    </Button>
  )
}
