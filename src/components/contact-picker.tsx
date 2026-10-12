"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { Loader2Icon, XIcon } from "lucide-react"
import { searchContacts } from "@/app/(app)/contacts/search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"

type Option = { id: string; label: string; detail: string }

/** Pick one contact by searching on the server (works for any number of contacts). Posts the id as `name`. */
export function ContactPicker({
  name,
  label,
  initial,
  placeholder,
  onChange,
}: {
  name: string
  label: string
  initial?: Option | null
  placeholder?: string
  onChange?: (picked: Option | null) => void
}) {
  const t = useT()
  const id = useId()
  const [picked, setPicked] = useState<Option | null>(initial ?? null)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Option[]>([])
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => start(async () => setResults(await searchContacts(q))), 200)
    return () => clearTimeout(timer)
  }, [q, open])

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {picked.label}
            {picked.detail && <span className="text-muted-foreground"> · {picked.detail}</span>}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.clear")}
            onClick={() => {
              setPicked(null)
              onChange?.(null)
            }}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={id}
            value={q}
            placeholder={placeholder ?? t("common.search")}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => setQ(e.target.value)}
          />
          {pending && <Loader2Icon className="absolute top-2 right-2 size-4 animate-spin text-muted-foreground" aria-hidden />}
          {open && results.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
              {results.map((r) => (
                <li key={r.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPicked(r)
                      onChange?.(r)
                      setOpen(false)
                    }}
                  >
                    {r.label}
                    {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
