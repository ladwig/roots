import { NavLink } from "@/components/nav-link"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"

// Tabs for planners (shifts.view); people with only shifts.self just get their own page.
export default async function ShiftsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  const tabs = ctx.can("shifts.view")
    ? [
        { href: "/shifts", label: t("shifts.tabs.plan") },
        { href: "/shifts/team", label: t("shifts.tabs.team") },
        ...(ctx.can("shifts.manage") ? [{ href: "/shifts/setup", label: t("shifts.tabs.setup") }] : []),
        { href: "/shifts/hours", label: t("shifts.tabs.hours") },
        ...(ctx.can("shifts.self") ? [{ href: "/shifts/me", label: t("shifts.tabs.me") }] : []),
      ]
    : []
  return (
    <div className="grid max-w-5xl gap-6">
      {tabs.length > 0 && (
        <nav aria-label={t("shifts.title")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
          {tabs.map((x) => (
            <NavLink key={x.href} href={x.href} exact={x.href === "/shifts"}>
              {x.label}
            </NavLink>
          ))}
        </nav>
      )}
      {children}
    </div>
  )
}

export const instant = false
