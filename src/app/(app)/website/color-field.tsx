"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

/** A brand colour: picker + hex field; empty = roots' default. Posts `name` as #rrggbb or "". */
export function ColorField({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  const t = useT()
  const [value, setValue] = useState(defaultValue ?? "")
  const valid = /^#[0-9a-f]{6}$/i.test(value)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={valid ? value : "#ffffff"} onChange={(e) => setValue(e.target.value)} className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
        <Input id={name} name={name} value={value} onChange={(e) => setValue(e.target.value.trim())} placeholder={t("website.brand.defaultColor")} pattern="#[0-9a-fA-F]{6}" maxLength={7} className="w-32 font-mono" />
      </div>
    </div>
  )
}
