import { NavLink } from "@/components/nav-link"
import { getContext } from "@/lib/context"

const tabs = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/roles", label: "Roles", permission: "org.roles.manage" },
  { href: "/settings/modules", label: "Modules" },
  { href: "/settings/integrations", label: "Integrations", permission: "org.integrations.manage" },
  { href: "/settings/activity", label: "Activity", permission: "org.audit.view" },
]

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <nav aria-label="Settings" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        {tabs
          .filter((t) => !t.permission || ctx.can(t.permission))
          .map((t) => (
            <NavLink key={t.href} href={t.href}>
              {t.label}
            </NavLink>
          ))}
      </nav>
      {children}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
