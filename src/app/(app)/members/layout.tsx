import { notFound } from "next/navigation"
import { NavLink } from "@/components/nav-link"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"

export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("members.view")
  if (!ctx.modules.has("members")) notFound()
  const t = await getT()
  const tabs = [
    { href: "/members", label: t("membership.tabs.members") },
    { href: "/members/dues", label: t("membership.tabs.dues") },
    ...(ctx.can("members.manage") ? [{ href: "/members/setup", label: t("membership.tabs.setup") }] : []),
  ]
  return (
    <div className="grid max-w-5xl gap-6">
      <nav aria-label={t("membership.title")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        {tabs.map((x) => (
          <NavLink key={x.href} href={x.href} exact={x.href === "/members"}>
            {x.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  )
}

export const instant = false
