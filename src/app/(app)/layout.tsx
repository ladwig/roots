import { signOut } from "@/app/login/actions"
import { NavLink } from "@/components/nav-link"
import { OrgSwitcher } from "@/components/org-switcher"
import { Button } from "@/components/ui/button"
import { getContext } from "@/lib/context"
import { modules } from "@/modules/registry"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const nav = [
    { href: "/", label: "Home" },
    ...modules
      .filter((m) => ctx.modules.has(m.key))
      .flatMap((m) => m.nav ?? [])
      .filter((n) => !n.permission || ctx.can(n.permission)),
    { href: "/settings", label: "Settings" },
  ]

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex flex-col gap-3 border-b bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
        <OrgSwitcher orgs={ctx.orgs} current={ctx.org} />
        <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <form action={signOut} className="hidden items-center justify-between gap-2 md:mt-auto md:flex">
          <span className="truncate text-xs text-muted-foreground" title={ctx.email}>
            {ctx.email}
          </span>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  )
}


// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
