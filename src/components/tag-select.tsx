"use client"

import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"

/**
 * Pick tags by clicking instead of typing. Posts them comma-separated under `name` (parse with parseTags()).
 * `creatable`: also type new tags (Enter or comma).
 */
export function TagSelect({ name, options, defaultValue = [], creatable, disabled, id }: { name: string; options: string[]; defaultValue?: string[]; creatable?: boolean; disabled?: boolean; id?: string }) {
  const t = useT()
  const [selected, setSelected] = useState<string[]>(defaultValue)
  const [draft, setDraft] = useState("")
  const has = (tag: string) => selected.some((s) => s.toLowerCase() === tag.toLowerCase())
  const add = (tag: string) => {
    const v = tag.trim().slice(0, 40)
    if (v && !has(v) && selected.length < 50) setSelected([...selected, v])
  }
  const remove = (tag: string) => setSelected(selected.filter((s) => s !== tag))
  const available = [...new Set([...options, ...defaultValue])].filter((o) => !has(o))

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={selected.join(", ")} />
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 dark:bg-input/30">
        {selected.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">
            {tag}
            {!disabled && (
              <button type="button" onClick={() => remove(tag)} aria-label={t("tags.remove", { tag })} className="rounded-full hover:opacity-70">
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        {creatable && !disabled ? (
          <Input
            id={id}
            value={draft}
            onChange={(e) => {
              const v = e.target.value
              if (v.includes(",")) {
                v.split(",").slice(0, -1).forEach(add)
                setDraft(v.split(",").at(-1) ?? "")
              } else setDraft(v)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add(draft)
                setDraft("")
              } else if (e.key === "Backspace" && !draft && selected.length) remove(selected[selected.length - 1])
            }}
            onBlur={() => {
              add(draft)
              setDraft("")
            }}
            placeholder={selected.length ? "" : t("tags.typeNew")}
            className="h-7 min-w-28 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        ) : (
          !selected.length && <span className="px-1 text-sm text-muted-foreground">{t("tags.none")}</span>
        )}
      </div>
      {!disabled && available.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("tags.available")}>
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <PlusIcon className="size-3" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
