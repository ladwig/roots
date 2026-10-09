import { HouseIcon, InboxIcon, SettingsIcon, ShieldIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import type { SidebarLink } from "@/components/app-sidebar"
import { OrgSwitcher } from "@/components/org-switcher"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { modules } from "@/modules/registry"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  const [{ count: unread }, { data: me }] = await Promise.all([
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.supabase.from("profiles").select("full_name, avatar_path").eq("id", ctx.userId).maybeSingle(),
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
    <AppShell
      header={<OrgSwitcher orgs={ctx.orgs} current={ctx.org} />}
      groups={groups}
      me={{ name: me?.full_name || ctx.email, email: ctx.email, avatar: me?.avatar_path ?? null }}
      title={ctx.org.name}
    >
      {ctx.viaPlatform && (
        <p className="mb-6 max-w-4xl rounded-lg border bg-muted px-3 py-2 text-sm">{t("admin.banner", { org: ctx.org.name })}</p>
      )}
      {children}
    </AppShell>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
