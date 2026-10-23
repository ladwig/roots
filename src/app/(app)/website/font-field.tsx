"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"
import { fontsHref, FONTS } from "@/site/theme"

/** A brand font: select + a sample line in that font (loaded from Google Fonts like on the public pages). */
export function FontField({ name, label, defaultValue, sample }: { name: string; label: string; defaultValue?: string; sample: string }) {
  const t = useT()
  const [value, setValue] = useState(defaultValue ?? "")
  const font = FONTS.find((f) => f.key === value)
  const href = fontsHref({ font_body: value || undefined })
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={name}>{label}</Label>
      <NativeSelect id={name} name={name} value={value} onChange={(e) => setValue(e.target.value)} className="w-full">
        <NativeSelectOption value="">{t("website.brand.defaultFont")}</NativeSelectOption>
        {FONTS.map((f) => (
          <NativeSelectOption key={f.key} value={f.key}>
            {f.family}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {href && <link rel="stylesheet" href={href} />}
      <p className="truncate rounded-md bg-muted px-3 py-2 text-lg" style={font ? { fontFamily: `"${font.family}", ${font.fallback}` } : undefined}>
        {sample}
      </p>
    </div>
  )
}
