"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { quickCreateContact, searchContacts } from "@/app/(app)/contacts/search"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
  const [creating, setCreating] = useState(false)
  const pick = (r: Option) => {
    setPicked(r)
    onChange?.(r)
    setOpen(false)
  }

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
          {open && (
            <ul id={`${id}-list`} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
              {results.map((r) => (
                <li key={r.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(r)}
                  >
                    {r.label}
                    {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false)
                    setCreating(true)
                  }}
                >
                  <PlusIcon className="size-4" /> {q.trim() ? t("contacts.quickCreateNamed", { name: q.trim() }) : t("contacts.quickCreate")}
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
      {creating && <QuickCreate initial={q.trim()} onClose={() => setCreating(false)} onCreated={pick} />}
    </div>
  )
}

// Side panel with the basic contact fields. Not a <form>: it is rendered inside the caller's form (portal or not,
// React would bubble the submit), so it saves via a button. More fields later on the contact page.
function QuickCreate({ initial, onClose, onCreated }: { initial: string; onClose: () => void; onCreated: (o: Option) => void }) {
  const t = useT()
  const [first, ...rest] = initial.includes("@") ? [""] : initial.split(/\s+/)
  const [v, setV] = useState({ first_name: first ?? "", last_name: rest.join(" "), email: initial.includes("@") ? initial : "", phone: "", company: "" })
  const [saving, start] = useTransition()
  const save = () =>
    start(async () => {
      const r = await quickCreateContact(v)
      if ("error" in r) return void toast.error(r.error)
      toast.success(t("contacts.created"))
      onCreated(r.option)
      onClose()
    })
  const field = (key: keyof typeof v, label: string, type = "text") => (
    <div className="grid gap-2">
      <Label htmlFor={`qc-${key}`}>{label}</Label>
      <Input
        id={`qc-${key}`}
        type={type}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            save()
          }
        }}
      />
    </div>
  )
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("contacts.new")}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-4 sm:grid-cols-2">
          {field("first_name", t("contacts.firstName"))}
          {field("last_name", t("contacts.lastName"))}
          <div className="sm:col-span-2">{field("email", t("contacts.email"), "email")}</div>
          {field("phone", t("contacts.phone"), "tel")}
          {field("company", t("contacts.company"))}
        </div>
        <SheetFooter>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />} {t("contacts.quickSave")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
