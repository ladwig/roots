import type { Element, Purpose } from "@/forms/elements"
import type { FieldDef } from "@/lib/custom-fields"

// What public_form() returns: the form plus exactly what rendering it needs.
export type PublicForm = {
  id: string
  title: string
  intro: string | null
  purpose: Purpose
  elements: Element[]
  success_text: string | null
  custom_fields: Omit<FieldDef, "required">[]
  types: { id: string; name: string; fee_cents: number; interval: string; entry_fee_cents: number }[]
  creditor: { name: string | null; id: string | null } | null
}
