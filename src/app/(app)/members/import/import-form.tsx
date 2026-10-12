"use client"

import { useCallback } from "react"
import { CsvImport } from "@/components/csv-import"
import { useT } from "@/i18n/client"
import type { FieldDef } from "@/lib/custom-fields"
import { IMPORT_FIELDS, readMember } from "@/members/fields"
import { importMembers } from "../actions"

export function MemberImport({ defs, types, labels, maxRows, today }: { defs: FieldDef[]; types: { id: string; name: string }[]; labels: Record<string, string>; maxRows: number; today: string }) {
  const t = useT()
  const validate = useCallback((row: Record<string, string>) => readMember((k) => row[k] ?? "", types, defs, today), [defs, types, today])
  const fields = [...IMPORT_FIELDS.map((f) => ({ ...f, label: labels[f.key] })), ...defs.map((d) => ({ key: `custom.${d.key}`, label: d.label, aliases: [d.key] }))]
  return (
    <CsvImport
      fields={fields}
      validate={validate}
      onImport={importMembers}
      matchLabel={t("contacts.email")}
      maxRows={maxRows}
      doneHref="/members"
      checkMapping={(keys) => {
        if (!["first_name", "last_name", "company", "email"].some((k) => keys.includes(k))) return t("errors.contact_needs_name_column")
        if (types.length > 1 && !keys.includes("membership.type")) return t("membership.importNeedsType")
        return null
      }}
    />
  )
}
