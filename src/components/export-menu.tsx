"use client"

import { DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/client"

/** "Export" button for a list: CSV or Excel of what the list shows (pass its filters as `query`). */
export function ExportMenu({ entity, query = {} }: { entity: string; query?: Record<string, string | undefined> }) {
  const t = useT()
  const href = (format: string) => {
    const p = new URLSearchParams(Object.entries({ ...query, format }).filter((e): e is [string, string] => !!e[1]))
    return `/export/${entity}?${p}`
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
        <DownloadIcon /> {t("export.button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<a href={href("xlsx")} />}>{t("export.xlsx")}</DropdownMenuItem>
        <DropdownMenuItem render={<a href={href("csv")} />}>{t("export.csv")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
