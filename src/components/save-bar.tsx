"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal, useFormStatus } from "react-dom"
import { useSearchParams } from "next/navigation"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { fieldValues, toRestore, type Sent, type Snapshot } from "@/lib/form-snapshot"
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
  // The URL as the page arrived (?error= from back()): <Notice> removes it from the address bar right after.
  const arrived = useRef(useSearchParams().toString())

  useEffect(() => {
    // Page: a bar across the whole content area (portal to its end). Drawer: inline, sticky inside the drawer.
    const place = setTimeout(() => setTarget(form()?.closest("[data-slot=sheet-content]") ? null : document.querySelector("[data-slot=sidebar-inset]")))
    const change = (e: Event) => {
      if (e.target instanceof Node && form()?.contains(e.target)) setDirty(true)
    }
    // A failed submit redirects back here and remounts the page, which empties the form: keep what was sent
    // (passwords and files never) and put it back below.
    const here = (f: HTMLFormElement) => ({ path: appRoute(location.pathname), form: [...document.forms].indexOf(f) })
    const submit = (e: Event) => {
      const f = form()
      if (e.target !== f || !f) return
      const secret = new Set([...f.querySelectorAll<HTMLInputElement>("input[type=password]")].map((i) => i.name))
      const sent: Sent = { ...here(f), at: Date.now(), values: [...fieldValues([...new FormData(f)].filter(([name]) => !secret.has(name)))] }
      try {
        sessionStorage.setItem(SENT_KEY, JSON.stringify(sent))
      } catch {}
    }
    document.addEventListener("input", change, true)
    document.addEventListener("change", change, true)
    document.addEventListener("submit", submit, true)
    const f = form()
    if (f) {
      try {
        const sent = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "null") as Sent | null
        const snap = toRestore(sent, { ...here(f), search: arrived.current, now: Date.now() })
        if (snap) {
          restoreForm(f, snap)
          f.dispatchEvent(new Event("change", { bubbles: true })) // the restored values are unsaved changes again
        }
        // Another form on this page may still need it; anything else is used up or stale.
        if (snap || !sent || sent.path !== here(f).path || Date.now() - sent.at > 30_000) sessionStorage.removeItem(SENT_KEY)
      } catch {}
    }
    return () => {
      clearTimeout(place)
      document.removeEventListener("input", change, true)
      document.removeEventListener("change", change, true)
      document.removeEventListener("submit", submit, true)
    }
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
        <Save submit={() => form()?.requestSubmit()} label={label ?? t("common.save")} onDone={() => setDirty(false)} />
      </div>
    </div>
  )
  return (
    <span ref={ref} className="contents">
      {target && bar ? createPortal(bar, target) : bar}
    </span>
  )
}

// Puts sent values back into the visible fields. Hidden inputs belong to components (tags, rich text, pickers) that
// keep their own state, so they are left alone; files and passwords are never restored.
function restoreForm(form: HTMLFormElement, snap: Snapshot) {
  const used = new Map<string, number>()
  for (const el of form.elements) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue
    if (!el.name || el.disabled || ["hidden", "file", "password", "submit", "button"].includes(el.type)) continue
    const values = snap.get(el.name)
    // Unticked boxes aren't sent at all: a missing name means none of them was ticked.
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) el.checked = (values ?? []).includes(el.value)
    else if (!values) continue
    else if (el instanceof HTMLSelectElement && el.multiple) for (const o of el.options) o.selected = values.includes(o.value)
    else {
      const i = used.get(el.name) ?? 0
      el.value = values[i] ?? ""
      used.set(el.name, i + 1)
    }
  }
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
