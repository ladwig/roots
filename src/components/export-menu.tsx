"use client"

import { DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/client"

/** "Export" button for a list: CSV or Excel of what the list shows (pass its filters as `query`). */
// `entity` = one export; `choices` = several exports of the same page (e.g. totals per person + all entries).
export function ExportMenu({ entity, query = {}, choices }: { entity?: string; query?: Record<string, string | undefined>; choices?: { entity: string; label: string }[] }) {
  const t = useT()
  const href = (e: string, format: string) => {
    const p = new URLSearchParams(Object.entries({ ...query, format }).filter((x): x is [string, string] => !!x[1]))
    return `/export/${e}?${p}`
  }
  const list = choices ?? [{ entity: entity!, label: "" }]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
        <DownloadIcon /> {t("export.button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {list.map((c) => (
          <DropdownMenuGroup key={c.entity}>
            {c.label && <DropdownMenuLabel>{c.label}</DropdownMenuLabel>}
            <DropdownMenuItem render={<a href={href(c.entity, "xlsx")} />}>{t("export.xlsx")}</DropdownMenuItem>
            <DropdownMenuItem render={<a href={href(c.entity, "csv")} />}>{t("export.csv")}</DropdownMenuItem>
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
