import { notFound } from "next/navigation"
import { NavLink } from "@/components/nav-link"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("hr.nav")

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("hr.view")
  if (!ctx.modules.has("hr")) notFound()
  const t = await getT()
  const tabs = [
    { href: "/hr", label: t("hr.tabs.people") },
    { href: "/hr/absences", label: t("hr.tabs.absences") },
    { href: "/hr/chart", label: t("hr.tabs.chart") },
    { href: "/hr/payroll", label: t("hr.tabs.payroll") },
  ]
  return (
    <div className="grid max-w-5xl gap-6">
      <nav aria-label={t("hr.title")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        {tabs.map((x) => (
          <NavLink key={x.href} href={x.href} exact={x.href === "/hr"}>
            {x.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  )
}

export const instant = false
