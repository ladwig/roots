"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { FIELD_TYPES, fieldKey, PLACEHOLDERS, type LetterField } from "@/letters/model"

/** A template's own fields (label + type); keys come from the label once and then stay. Posts JSON as `name`. */
export function FieldsEditor({ name, defaultValue, disabled }: { name: string; defaultValue: LetterField[]; disabled?: boolean }) {
  const t = useT()
  const [rows, setRows] = useState<(LetterField & { fresh?: boolean })[]>(defaultValue)
  const update = (i: number, patch: Partial<LetterField>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, ...(r.fresh && patch.label !== undefined && { key: unique(fieldKey(patch.label), i) }) } : r)))
  const unique = (key: string, i: number) => {
    let k = key
    const taken = (k: string) => (PLACEHOLDERS as readonly string[]).includes(k) || rows.some((r, j) => j !== i && r.key === k)
    for (let n = 2; taken(k); n++) k = `${key}_${n}`
    return k
  }

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => r.label.trim()).map(({ key, label, type }) => ({ key, label, type })))} />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_8.5rem_auto] items-center gap-2">
          <div className="grid gap-0.5">
            <Input aria-label={t("letters.fieldLabel")} placeholder={t("letters.fieldLabel")} value={r.label} maxLength={80} disabled={disabled} onChange={(e) => update(i, { label: e.target.value })} />
            {r.label.trim() && <code className="px-1 text-xs text-muted-foreground">{`{${r.key}}`}</code>}
          </div>
          <NativeSelect aria-label={t("letters.fieldType")} value={r.type} disabled={disabled} onChange={(e) => update(i, { type: e.target.value as LetterField["type"] })}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {t.dynamic(`letters.fieldTypes.${ft}`)}
              </option>
            ))}
          </NativeSelect>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" size="icon" variant="ghost" aria-label={t("letters.removeField")} disabled={disabled} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              }
            />
            <TooltipContent>{t("letters.removeField")}</TooltipContent>
          </Tooltip>
        </div>
      ))}
      {rows.length < 20 && (
        <Button type="button" size="sm" variant="outline" className="justify-self-start" disabled={disabled} onClick={() => setRows([...rows, { key: "", label: "", type: "text", fresh: true }])}>
          <PlusIcon /> {t("letters.addField")}
        </Button>
      )}
    </div>
  )
}
