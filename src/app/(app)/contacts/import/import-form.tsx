"use client"

import { useCallback } from "react"
import { CsvImport } from "@/components/csv-import"
import type { FieldDef } from "@/lib/custom-fields"
import { importContacts } from "../actions"
import { CONTACT_FIELDS, contactName, readContact } from "../fields"

export function ContactImport({ defs, labels, matchLabel, maxRows }: { defs: FieldDef[]; labels: Record<string, string>; matchLabel: string; maxRows: number }) {
  const validate = useCallback((row: Record<string, string>) => readContact((k) => row[k] ?? "", defs), [defs])
  const fields = [
    ...CONTACT_FIELDS.map((f) => ({ ...f, label: labels[f.key] })),
    ...defs.map((d) => ({ key: `custom.${d.key}`, label: d.label, aliases: [d.key] })),
  ]
  return (
    <CsvImport
      fields={fields}
      validate={validate}
      describe={(r) => {
        const v = readContact((k) => r[k] ?? "", defs)
        return "row" in v ? [contactName(v.row), v.row.email].filter(Boolean).join(" · ") : ""
      }}
      onImport={importContacts}
      matchLabel={matchLabel}
      maxRows={maxRows}
      doneHref="/contacts"
    />
  )
}
