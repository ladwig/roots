"use client"

import { MultiSelect } from "@/components/multi-select"
import { useT } from "@/i18n/client"

/**
 * Pick tags from a search dropdown; `creatable` also offers new ones („x“ anlegen). Posts them comma-separated under
 * `name` (parse with parseTags()).
 */
export function TagSelect({ name, options, defaultValue = [], creatable, disabled, id }: { name: string; options: string[]; defaultValue?: string[]; creatable?: boolean; disabled?: boolean; id?: string }) {
  const t = useT()
  return (
    <MultiSelect
      name={name}
      id={id}
      joined
      creatable={creatable}
      disabled={disabled}
      defaultValue={defaultValue}
      options={[...new Set([...options, ...defaultValue])].map((v) => ({ value: v, label: v }))}
      placeholder={creatable ? t("tags.typeNew") : t("tags.search")}
    />
  )
}
