"use client"

import { useEffect, useId, useRef, useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"

export type MultiOption = { value: string; label: string }

/**
 * Several values as chips (`single`: one value, picking another replaces it) + a search field with a dropdown (type to filter, Enter takes the first hit).
 * `creatable`: the dropdown also offers „<typed>“ as a new value. Posts `name` once per value, or comma-joined with `joined`.
 * ponytail: filters the given options in the browser; pickers over big tables use a server search (ContactPicker).
 */
export function MultiSelect({
  name,
  options,
  defaultValue = [],
  creatable,
  joined,
  single,
  disabled,
  id: givenId,
  placeholder,
  max = 50,
}: {
  name: string
  options: MultiOption[]
  defaultValue?: string[]
  creatable?: boolean
  joined?: boolean
  single?: boolean
  disabled?: boolean
  id?: string
  placeholder?: string
  max?: number
}) {
  const t = useT()
  const ownId = useId()
  const id = givenId ?? ownId
  const [selected, setSelected] = useState(defaultValue)
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const term = q.trim().slice(0, 40)
  const has = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase())
  const hits = options.filter((o) => !has(o.value) && o.label.toLowerCase().includes(term.toLowerCase())).slice(0, 30)
  const canCreate = creatable && term && !has(term) && !options.some((o) => o.label.toLowerCase() === term.toLowerCase())
  const add = (v: string) => {
    if (v && single) setSelected([v])
    else if (v && !has(v) && selected.length < max) setSelected([...selected, v])
    setQ("")
  }
  // Chips change no real input: send an "input" event so forms that react to it (autosave) notice.
  const box = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else box.current?.dispatchEvent(new Event("input", { bubbles: true }))
  }, [selected])
  const row = "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"

  return (
    <div ref={box} className="relative">
      {joined ? <input type="hidden" name={name} value={selected.join(", ")} /> : selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1 dark:bg-input/30">
        {selected.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">
            {labelOf(v)}
            {!disabled && (
              <button type="button" onClick={() => setSelected(selected.filter((s) => s !== v))} aria-label={t("tags.remove", { tag: labelOf(v) })} className="rounded-full hover:opacity-70">
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <Input
            id={id}
            value={q}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            placeholder={selected.length ? "" : (placeholder ?? t("common.search"))}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (hits[0]) add(hits[0].value)
                else if (canCreate) add(term)
              } else if (e.key === "Backspace" && !q && selected.length) setSelected(selected.slice(0, -1))
              else if (e.key === "Escape") setOpen(false)
            }}
            className="h-6 min-w-28 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        )}
      </div>
      {open && !disabled && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
          {hits.map((o) => (
            <li key={o.value} role="option" aria-selected={false}>
              <button type="button" className={row} onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.value)}>
                {o.label}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button type="button" className={`${row} text-primary`} onMouseDown={(e) => e.preventDefault()} onClick={() => add(term)}>
                <PlusIcon className="size-4" /> {t("tags.create", { tag: term })}
              </button>
            </li>
          )}
          {!hits.length && !canCreate && <li className="px-2 py-1.5 text-sm text-muted-foreground">{t("tags.noMatch")}</li>}
        </ul>
      )}
    </div>
  )
}
