"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { NativeSelect } from "@/components/ui/native-select"

// A select that writes one URL param (filters live in the URL).
export function FilterSelect({ param, value, label, children }: { param: string; value: string; label: string; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      className="w-48"
      onChange={(e) => {
        const p = new URLSearchParams(params.toString())
        if (e.target.value) p.set(param, e.target.value)
        else p.delete(param)
        p.delete("task")
        router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false })
      }}
    >
      {children}
    </NativeSelect>
  )
}
