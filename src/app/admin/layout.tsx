import Link from "next/link"
import { signOut } from "@/app/login/actions"
import { NavLink } from "@/components/nav-link"
import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/i18n/client"
import { getT } from "@/i18n/server"
import { requirePlatformAdmin } from "@/lib/context"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformAdmin()
  const t = await getT()
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex flex-col gap-3 border-b bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
        <p className="px-2.5 py-1 font-heading font-semibold">{t("admin.title")}</p>
        <nav aria-label={t("admin.nav")} className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible">
          <NavLink href="/admin/orgs">{t("admin.orgs.title")}</NavLink>
          <NavLink href="/admin/users">{t("admin.users.title")}</NavLink>
        </nav>
        <div className="hidden gap-2 md:mt-auto md:grid">
          <Button render={<Link href="/" />} nativeButton={false} variant="outline" size="sm">
            {t("admin.backToApp")}
          </Button>
          <LocaleSwitcher />
          <form action={signOut} className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground" title={session.email}>
              {session.email}
            </span>
            <Button type="submit" variant="ghost" size="sm">
              {t("auth.signOut")}
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto grid max-w-5xl gap-6">{children}</div>
      </main>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
