"use client"

import { useCallback } from "react"
import { CsvImport } from "@/components/csv-import"
import { useT } from "@/i18n/client"
import type { FieldDef } from "@/lib/custom-fields"
import { importContacts } from "../actions"
import { CONTACT_FIELDS, readContact } from "../fields"

export function ContactImport({ defs, labels, matchLabel, maxRows }: { defs: FieldDef[]; labels: Record<string, string>; matchLabel: string; maxRows: number }) {
  const t = useT()
  const validate = useCallback((row: Record<string, string>) => readContact((k) => row[k] ?? "", defs), [defs])
  const fields = [
    ...CONTACT_FIELDS.map((f) => ({ ...f, label: labels[f.key] })),
    ...defs.map((d) => ({ key: `custom.${d.key}`, label: d.label, aliases: [d.key] })),
  ]
  return (
    <CsvImport
      fields={fields}
      validate={validate}
      onImport={importContacts}
      matchLabel={matchLabel}
      maxRows={maxRows}
      doneHref="/contacts"
      checkMapping={(keys, mode) => {
        if (!["first_name", "last_name", "company", "email"].some((k) => keys.includes(k))) return t("errors.contact_needs_name_column")
        // New contacts need every required field; an update import may leave them out.
        const missing = defs.filter((d) => d.required && !keys.includes(`custom.${d.key}`)).map((d) => d.label)
        return mode === "skip" && missing.length ? t("errors.required_columns", { fields: t.list(missing) }) : null
      }}
    />
  )
}
