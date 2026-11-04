"use client"

import { useEffect, useState } from "react"
import { useT } from "@/i18n/client"
import type { CatalogVariant, ProductOption } from "@/shop/fields"
import { variantFor } from "@/shop/fields"
import { cn } from "@/lib/utils"

/**
 * Variant options as button rows (Farbe ○ ○, Größe S M L): the picks point to one variant (posted as `item`);
 * combinations without an available variant are greyed out. A variant's own picture is shown in the gallery
 * (window event "shop:image", see gallery.tsx).
 */
export function OptionPicker({ options, variants, prices }: { options: ProductOption[]; variants: CatalogVariant[]; prices: Record<string, string> }) {
  const t = useT()
  const available = (v: CatalogVariant | null) => !!v && v.left !== 0
  const start = variants.find((v) => available(v) && v.values)?.values ?? options.map((o) => o.values[0])
  const [picked, setPicked] = useState<string[]>(start)
  const current = variantFor(variants, picked)
  const ok = available(current)

  useEffect(() => {
    if (current?.image) window.dispatchEvent(new CustomEvent("shop:image", { detail: current.image }))
  }, [current?.image])

  return (
    <div className="grid gap-3">
      <input type="hidden" name="item" value={ok ? current!.id : ""} />
      {options.map((o, i) => (
        <fieldset key={o.name} className="grid gap-1.5">
          <legend className="pb-1 text-sm font-medium">
            {o.name}: <span className="font-normal text-muted-foreground">{picked[i]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {o.values.map((value) => {
              const next = picked.map((p, j) => (j === i ? value : p))
              const possible = available(variantFor(variants, next))
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={picked[i] === value}
                  onClick={() => setPicked(next)}
                  className={cn(
                    "min-w-10 rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    picked[i] === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    !possible && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  {value}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <p className={cn("text-sm", ok ? "text-muted-foreground" : "font-medium text-destructive")}>{ok ? prices[current!.id] : t("store.combinationUnavailable")}</p>
    </div>
  )
}
