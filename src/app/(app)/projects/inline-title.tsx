"use client"

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useT } from "@/i18n/client"
import { renameProjectAction } from "./actions"

/** The project's name as the page title, editable in place: saves on blur or Enter, Escape resets. */
export function InlineTitle({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const t = useT()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const save = () => {
    const el = input.current
    if (!el) return
    const next = el.value.trim()
    if (!next || next === name) return void (el.value = name)
    start(async () => {
      const r = await renameProjectAction(id, next)
      if (r.error) {
        toast.error(r.error)
        el.value = name
      } else router.refresh()
    })
  }
  if (disabled) return <>{name}</>
  return (
    <input
      ref={input}
      defaultValue={name}
      maxLength={200}
      aria-label={t("projects.name")}
      disabled={pending}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = name
          e.currentTarget.blur()
        }
      }}
      className="field-sizing-content min-w-[8ch] max-w-full truncate rounded-md bg-transparent px-1 -mx-1 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}
