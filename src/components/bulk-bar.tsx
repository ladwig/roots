"use client"

import { useEffect, useState } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/**
 * Acting on several rows at once. <DataTable select={{ form }}> puts a checkbox on each row (name "ids", form=<form>)
 * and one in the header that selects all; this bar IS that <form>: hidden while nothing is ticked, then a floating bar
 * "3 ausgewählt" with the list's actions as children (<SubmitButton formAction={serverAction}>, inputs). Server
 * actions read fd.getAll("ids"). After a submit the ticks are cleared.
 */
export function BulkBar({ form, children }: { form: string; children: React.ReactNode }) {
  const t = useT()
  const [count, setCount] = useState(0)
  // Phone cards and the desktop table both render each row; only the visible copy counts.
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${form}"][name="ids"]`)].filter((b) => b.offsetParent !== null)
  const all = () => document.querySelectorAll<HTMLInputElement>(`input[data-bulk-all="${form}"]`)

  useEffect(() => {
    const sync = () => {
      const list = boxes()
      const n = list.filter((b) => b.checked).length
      setCount(n)
      all().forEach((a) => {
        a.checked = n > 0 && n === list.length
        a.indeterminate = n > 0 && n < list.length
      })
    }
    const change = (e: Event) => {
      const el = e.target as HTMLInputElement
      if (el.dataset.bulkAll === form) boxes().forEach((b) => (b.checked = el.checked))
      if (el.dataset.bulkAll === form || el.getAttribute("form") === form) sync()
    }
    document.addEventListener("change", change)
    sync()
    return () => document.removeEventListener("change", change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[form="${form}"][name="ids"]`).forEach((b) => (b.checked = false))
    all().forEach((a) => ((a.checked = false), (a.indeterminate = false)))
    setCount(0)
  }

  return (
    <form
      id={form}
      hidden={!count}
      // The ticked ids are collected after this handler, so clear them on the next tick.
      onSubmit={() => setTimeout(clear, 0)}
      className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
    >
      <span className="px-1 text-sm font-medium tabular-nums">{t("common.selected", { count })}</span>
      {children}
      <Button type="button" variant="ghost" size="icon-sm" onClick={clear} aria-label={t("common.clearSelection")}>
        <XIcon />
      </Button>
    </form>
  )
}
