"use client"

import { useRef, useSyncExternalStore } from "react"
import { Input } from "@/components/ui/input"

const noop = () => () => {}

// Cart quantity: saves itself a moment after a change (the button is only the fallback without JavaScript).
export function QtyInput({ defaultValue, max, label, fallback }: { defaultValue: number; max: number; label: string; fallback: React.ReactNode }) {
  const js = useSyncExternalStore(noop, () => true, () => false) // false on the server, true once hydrated
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  return (
    <>
      <Input
        name="q"
        type="number"
        min={0}
        max={max}
        defaultValue={defaultValue}
        aria-label={label}
        className="w-16"
        onChange={(e) => {
          const form = e.currentTarget.form
          clearTimeout(timer.current)
          if (e.currentTarget.value !== "") timer.current = setTimeout(() => form?.requestSubmit(), 500)
        }}
      />
      {!js && fallback}
    </>
  )
}
