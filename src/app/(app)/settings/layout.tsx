import { SectionNav } from "@/components/section-nav"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { titled } from "@/lib/title"
import { SettingsTitle } from "./section-title"
import { SETTINGS_TABS } from "./tabs"

export const generateMetadata = titled("shell.settings")

// The sections are a navigation beside the page (./tabs.ts); the top bar's gear opens the first one.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [ctx, t] = await Promise.all([getContext(), getT()])
  const items = SETTINGS_TABS.filter((s) => !s.permission || ctx.can(s.permission)).map((s) => ({ href: `/settings/${s.key}`, label: t.dynamic(`settings.tabs.${s.key}`) }))
  return (
    <div className="grid max-w-5xl gap-6 md:grid-cols-[auto_1fr]">
      <SectionNav label={t("shell.settings")} items={items} />
      <div className="grid max-w-3xl min-w-0 content-start gap-6">
        <SettingsTitle />
        {children}
      </div>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
