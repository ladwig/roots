"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal, useFormStatus } from "react-dom"
import { useSearchParams } from "next/navigation"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { fieldValues, keepSent, restoreFields, toRestore, type Field, type Sent } from "@/lib/form-snapshot"
import { appRoute } from "@/lib/url"

const SENT_KEY = "roots-form-sent"

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
  const [target, setTarget] = useState<Element | null>(null)
  const [dirty, setDirty] = useState(false)
  // The form is looked up when needed, never remembered: React may swap the <form> element after the first render
  // (streamed parts of the page), and a remembered element / id then points nowhere (button did nothing).
  const form = () => ref.current?.closest("form") ?? null
  // A failed submit (back(path, { error })) comes back with an emptied form: React resets it after the action, and in
  // path mode (/app/…) the page even remounts. What was sent (never passwords or files) waits in sessionStorage for
  // at most 30 s and is put back by tryRestore(): on mount (remount) and when the submit ends (same page instance).
  const search = useSearchParams().toString()
  const arrived = useRef(search) // the URL as the page arrived: <Notice> removes ?error= from the address bar right after
  const here = (f: HTMLFormElement) => ({ path: appRoute(location.pathname), form: [...document.forms].indexOf(f) })
  const tryRestore = (query: string) => {
    const f = form()
    if (!f) return
    try {
      const sent = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "null") as Sent | null
      const at = { ...here(f), search: query, now: Date.now() }
      const snap = toRestore(sent, at)
      if (snap) {
        restoreFields(f.elements as unknown as Iterable<Field>, snap)
        f.dispatchEvent(new Event("change", { bubbles: true })) // the restored values are unsaved changes again
      }
      if (!keepSent(sent, at)) sessionStorage.removeItem(SENT_KEY)
    } catch {}
  }

  useEffect(() => {
    // Page: a bar across the whole content area (portal to its end). Drawer: inline, sticky inside the drawer.
    const place = setTimeout(() => setTarget(form()?.closest("[data-slot=sheet-content]") ? null : document.querySelector("[data-slot=sidebar-inset]")))
    const change = (e: Event) => {
      if (e.target instanceof Node && form()?.contains(e.target)) setDirty(true)
    }
    const submit = (e: Event) => {
      const f = form()
      if (e.target !== f || !f) return
      const secret = new Set([...f.querySelectorAll<HTMLInputElement>("input[type=password]")].map((i) => i.name))
      const sent: Sent = { ...here(f), at: Date.now(), values: [...fieldValues([...new FormData(f)].filter(([name]) => !secret.has(name)))] }
      try {
        sessionStorage.setItem(SENT_KEY, JSON.stringify(sent))
      } catch {}
      // Never kept longer than needed (IBANs, tax IDs…), even if no SaveBar mounts again.
      setTimeout(() => {
        try {
          if ((JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "null") as Sent | null)?.at === sent.at) sessionStorage.removeItem(SENT_KEY)
        } catch {}
      }, 30_000)
    }
    document.addEventListener("input", change, true)
    document.addEventListener("change", change, true)
    document.addEventListener("submit", submit, true)
    tryRestore(arrived.current)
    return () => {
      clearTimeout(place)
      document.removeEventListener("input", change, true)
      document.removeEventListener("change", change, true)
      document.removeEventListener("submit", submit, true)
    }
    // Once per mount: tryRestore reads the form and storage when called, not values from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Marks the form for confirmDiscard() (drawers, dialogs), create forms (`always`) included.
  useEffect(() => {
    form()?.toggleAttribute("data-dirty", dirty)
  }, [dirty])

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
  const bar = show && (
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
        <Save submit={() => form()?.requestSubmit()} label={label ?? t("common.save")} onDone={() => (setDirty(false), tryRestore(search))} />
      </div>
    </div>
  )
  return (
    <span ref={ref} className="contents">
      {target && bar ? createPortal(bar, target) : bar}
    </span>
  )
}

/** Before a drawer/dialog closes: true when no form inside `root` has unsaved changes, or the person agrees to drop them. */
export function confirmDiscard(root: ParentNode | null, message: string): boolean {
  return !root?.querySelector("form[data-dirty]") || window.confirm(message)
}

// Inside the form's React tree (also through the portal), so useFormStatus sees the running action.
function Save({ submit, label, onDone }: { submit: () => void; label: string; onDone: () => void }) {
  const { pending } = useFormStatus()
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !pending) onDone()
    was.current = pending
  }, [pending, onDone])
  return (
    // requestSubmit runs the browser's checks (required, patterns) and shows their hints like a normal submit.
    <Button type="button" onClick={submit} size="sm" disabled={pending} aria-busy={pending || undefined}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden />}
      {label}
    </Button>
  )
}
