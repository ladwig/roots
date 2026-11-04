"use client"

import { useRef, useSyncExternalStore } from "react"
import { Input } from "@/components/ui/input"

const noop = () => () => {}

// A cart field that saves itself a moment after a change (the button is only the fallback without JavaScript).
function AutoInput({ fallback, valid, ...props }: React.ComponentProps<typeof Input> & { fallback: React.ReactNode; valid: (v: string) => boolean }) {
  const js = useSyncExternalStore(noop, () => true, () => false) // false on the server, true once hydrated
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  return (
    <>
      <Input
        {...props}
        onChange={(e) => {
          const form = e.currentTarget.form
          clearTimeout(timer.current)
          if (valid(e.currentTarget.value)) timer.current = setTimeout(() => form?.requestSubmit(), 700)
        }}
      />
      {!js && fallback}
    </>
  )
}

export function QtyInput({ defaultValue, max, label, fallback }: { defaultValue: number; max: number; label: string; fallback: React.ReactNode }) {
  return <AutoInput name="q" type="number" min={0} max={max} defaultValue={defaultValue} aria-label={label} className="w-16" fallback={fallback} valid={(v) => v !== ""} />
}

/** Name your price: the buyer's amount ("12,50"); the server checks the minimum. */
export function PriceInput({ defaultValue, label, fallback }: { defaultValue: string; label: string; fallback: React.ReactNode }) {
  return <AutoInput name="price" inputMode="decimal" defaultValue={defaultValue} aria-label={label} className="w-24 text-right" fallback={fallback} valid={(v) => /^\d+([.,]\d{0,2})?$/.test(v.trim())} />
}
