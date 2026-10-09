import { cookies } from "next/headers"
import { HouseIcon, InboxIcon, SettingsIcon, ShieldIcon } from "lucide-react"
import { AppSidebar, type SidebarLink } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { modules } from "@/modules/registry"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  const [{ count: unread }, { data: me }, jar] = await Promise.all([
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.supabase.from("profiles").select("full_name, avatar_path").eq("id", ctx.userId).maybeSingle(),
    cookies(),
  ])
  const moduleLinks: SidebarLink[] = modules
    .filter((m) => ctx.modules.has(m.key))
    .flatMap((m) => m.nav ?? [])
    .filter((n) => !n.permission || ctx.can(n.permission))
    .map((n) => ({ href: n.href, label: t.dynamic(n.label), icon: <n.icon /> }))
  const groups = [
    {
      items: [
        { href: "/", label: t("shell.home"), icon: <HouseIcon /> },
        { href: "/notifications", label: t("inbox.title"), icon: <InboxIcon />, count: unread ?? 0 },
      ],
    },
    ...(moduleLinks.length ? [{ label: t("home.modules"), items: moduleLinks }] : []),
    {
      label: t("shell.org"),
      items: [
        { href: "/settings", label: t("shell.settings"), icon: <SettingsIcon /> },
        ...(ctx.isPlatformAdmin ? [{ href: "/admin", label: t("admin.link"), icon: <ShieldIcon /> }] : []),
      ],
    },
  ]

  return (
    // Sidebar open/collapsed is remembered in the sidebar_state cookie (set by the shadcn sidebar).
    <SidebarProvider defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <AppSidebar
        orgs={ctx.orgs}
        org={ctx.org}
        groups={groups}
        me={{ name: me?.full_name || ctx.email, email: ctx.email, avatar: me?.avatar_path ?? null }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4" />
          <span className="truncate text-sm font-medium">{ctx.org.name}</span>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {ctx.viaPlatform && (
            <p className="mx-auto mb-6 max-w-4xl rounded-lg border bg-muted px-3 py-2 text-sm">
              {t("admin.banner", { org: ctx.org.name })}
            </p>
          )}
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
