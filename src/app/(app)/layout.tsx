import { signOut } from "@/app/login/actions"
import { NavLink } from "@/components/nav-link"
import { OrgSwitcher } from "@/components/org-switcher"
import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/i18n/client"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { modules } from "@/modules/registry"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  const nav = [
    { href: "/", label: t("shell.home") },
    ...modules
      .filter((m) => ctx.modules.has(m.key))
      .flatMap((m) => m.nav ?? [])
      .filter((n) => !n.permission || ctx.can(n.permission))
      .map((n) => ({ href: n.href, label: t.dynamic(n.label) })),
    { href: "/settings", label: t("shell.settings") },
    ...(ctx.isPlatformAdmin ? [{ href: "/admin", label: t("admin.link") }] : []),
  ]

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex flex-col gap-3 border-b bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
        <OrgSwitcher orgs={ctx.orgs} current={ctx.org} />
        <nav aria-label={t("shell.mainNav")} className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden gap-2 md:mt-auto md:grid">
          <LocaleSwitcher />
          <form action={signOut} className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground" title={ctx.email}>
              {ctx.email}
            </span>
            <Button type="submit" variant="ghost" size="sm">
              {t("auth.signOut")}
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {ctx.viaPlatform && (
          <p className="mx-auto mb-6 max-w-4xl rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("admin.banner", { org: ctx.org.name })}
          </p>
        )}
        {children}
      </main>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
