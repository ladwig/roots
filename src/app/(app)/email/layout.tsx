import { notFound } from "next/navigation"
import { NavLink } from "@/components/nav-link"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"

export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("email.view")
  if (!ctx.modules.has("email")) notFound()
  const t = await getT()
  return (
    <div className="grid max-w-5xl gap-6">
      <nav aria-label={t("email.title")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        <NavLink href="/email" exact>
          {t("email.tabs.campaigns")}
        </NavLink>
        <NavLink href="/email/automations">{t("email.tabs.automations")}</NavLink>
        <NavLink href="/email/log">{t("email.tabs.log")}</NavLink>
      </nav>
      {children}
    </div>
  )
}

export const instant = false
