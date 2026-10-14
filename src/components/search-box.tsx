"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"

// List search: results update while typing (short pause), other filters in the URL stay, paging restarts. Still a
// plain GET form, so Enter works without JavaScript too. `keep` = params to send along on that plain submit.
export function SearchBox({ q, label, keep }: { q?: string; label: string; keep?: Record<string, string> }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(q ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  const go = (next: string) => {
    const p = new URLSearchParams(params.toString())
    if (next.trim()) p.set("q", next.trim())
    else p.delete("q")
    p.delete("page")
    const s = p.toString()
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }
  return (
    <form
      role="search"
      className="w-full sm:max-w-xs"
      onSubmit={(e) => {
        e.preventDefault()
        go(value)
      }}
    >
      {Object.entries(keep ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input
        type="search"
        name="q"
        data-shortcut="search"
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={(e) => {
          setValue(e.target.value)
          if (timer.current) clearTimeout(timer.current)
          const next = e.target.value
          timer.current = setTimeout(() => go(next), 300)
        }}
      />
    </form>
  )
}
