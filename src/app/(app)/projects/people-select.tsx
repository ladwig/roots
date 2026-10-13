"use client"

import { MultiSelect } from "@/components/multi-select"
import { useT } from "@/i18n/client"

// Assignees: team members from a search dropdown; posts one `name` field per user id.
export function PeopleSelect({ name, team, defaultValue, id }: { name: string; team: { id: string; name: string }[]; defaultValue: string[]; id?: string }) {
  const t = useT()
  return <MultiSelect name={name} id={id} max={20} defaultValue={defaultValue} options={team.map((p) => ({ value: p.id, label: p.name }))} placeholder={t("projects.searchPeople")} />
}
