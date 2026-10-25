"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"

// Kind, value and limit of a ticket code. Unlock-only codes ("none") have neither: they open hidden ticket types,
// and how many of those exist is the type's quota.
export function CodeKindFields({ kind: initial, value, maxUses }: { kind: string; value: string; maxUses: number | null }) {
  const t = useT()
  const [kind, setKind] = useState(initial)
  const discount = kind !== "none"
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="grid gap-2">
        <Label htmlFor="c-kind">{t("tickets.discount")}</Label>
        <NativeSelect id="c-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full">
          {(["percent", "amount", "none"] as const).map((k) => (
            <NativeSelectOption key={k} value={k}>
              {t.dynamic(`tickets.kinds.${k}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {discount ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="c-value">{t("tickets.codeValueLabel")}</Label>
            <Input id="c-value" name="value" inputMode="decimal" defaultValue={value} placeholder="20" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-max">{t("tickets.maxUses")}</Label>
            <Input id="c-max" name="max_uses" type="number" min={1} defaultValue={maxUses ?? ""} placeholder="∞" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">{t("tickets.maxUsesHint")}</p>
        </>
      ) : (
        <p className="self-end text-sm text-muted-foreground sm:col-span-2">{t("tickets.unlockLimitHint")}</p>
      )}
    </div>
  )
}
