"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/client"

/**
 * "Wirklich?" before destructive submits. Any submit button with data-confirm="<message key>" (gets { count } = ticked
 * "ids" of its form, for bulk bars) is held back until the dialog is confirmed, then submitted again with the same
 * button, so server actions and formAction work unchanged. Mounted once in <AppShell>.
 */
export function ConfirmHost() {
  const t = useT()
  const [ask, setAsk] = useState<{ form: HTMLFormElement; button: HTMLElement; key: string; count: number; label: string } | null>(null)
  const passed = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Capture on document runs before React's own submit handling, so stopping here keeps the action from starting.
    const onSubmit = (e: SubmitEvent) => {
      const button = e.submitter
      const key = button?.dataset.confirm
      if (!button || !key) return
      if (passed.current === button || (passed.current && !passed.current.isConnected)) return void (passed.current = null)
      e.preventDefault()
      e.stopPropagation()
      const form = e.target as HTMLFormElement
      setAsk({ form, button, key, count: new FormData(form, button).getAll("ids").length, label: button.textContent?.trim() ?? "" })
    }
    document.addEventListener("submit", onSubmit, true)
    return () => document.removeEventListener("submit", onSubmit, true)
  }, [])

  const confirm = () => {
    if (!ask) return
    passed.current = ask.button
    // Menu items are gone once their menu closed; they carry no formAction/value, so a plain submit is the same.
    if (ask.button.isConnected) ask.form.requestSubmit(ask.button)
    else ask.form.requestSubmit()
    setAsk(null)
  }

  return (
    <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ask ? t.dynamic(ask.key, { count: ask.count }) : ""}</DialogTitle>
          {ask && t.has(`${ask.key}Hint`) && <DialogDescription>{t.dynamic(`${ask.key}Hint`)}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAsk(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} autoFocus>
            {ask?.label || t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
