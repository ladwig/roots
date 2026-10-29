"use client"

import { usePathname } from "next/navigation"
import { useT } from "@/i18n/client"

// Heading of the settings: the current section (the sections are in the navigation beside it).
export function SettingsTitle() {
  const t = useT()
  const key = /\/settings\/([a-z]+)/.exec(usePathname())?.[1]
  return (
    <header className="grid gap-1">
      <p className="text-sm text-muted-foreground">{t("settings.title")}</p>
      <h1 className="font-heading text-2xl font-semibold">{key && t.has(`settings.tabs.${key}`) ? t.dynamic(`settings.tabs.${key}`) : t("settings.title")}</h1>
    </header>
  )
}
