import { NavLink } from "@/components/nav-link"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"

const tabs = [
  { key: "general" },
  { key: "members" },
  { key: "roles" },
  { key: "modules" },
  { key: "integrations", permission: "org.integrations.manage" },
  { key: "notifications", permission: "org.integrations.manage" },
  { key: "activity", permission: "org.audit.view" },
]

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("settings.title")}</h1>
      <nav aria-label={t("settings.nav")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        {tabs
          .filter((tab) => !tab.permission || ctx.can(tab.permission))
          .map((tab) => (
            <NavLink key={tab.key} href={`/settings/${tab.key}`}>
              {t.dynamic(`settings.tabs.${tab.key}`)}
            </NavLink>
          ))}
      </nav>
      {children}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
