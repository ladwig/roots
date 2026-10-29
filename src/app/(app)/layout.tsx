import { APP_HOME } from "@/lib/url"
import { FolderIcon, HouseIcon, InboxIcon, SettingsIcon, ShieldIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import type { SidebarLink } from "@/components/app-sidebar"
import { OrgBar } from "@/components/org-bar"
import { OrgSwitcher } from "@/components/org-switcher"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { visibleNav } from "@/modules/nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  const [{ count: unread }, { data: me }, { data: myContact }] = await Promise.all([
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.supabase.from("profiles").select("full_name, avatar_path").eq("id", ctx.userId).maybeSingle(),
    // Linked to a contact of this org → "Mein Mitgliederbereich" in the user menu (members module on).
    ctx.modules.has("members") ? ctx.supabase.from("contacts").select("id").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ])
  // Areas with their sub-pages (src/modules/nav.ts); an area opens its first sub-page.
  const moduleLinks: SidebarLink[] = visibleNav((m) => ctx.modules.has(m), ctx.can).map((a) => ({
    href: a.children[0].href,
    label: t.dynamic(a.label),
    icon: <a.icon />,
    children: a.children.map((c) => ({ href: c.href, label: t.dynamic(c.label) })),
  }))
  const links = [
    ...(ctx.can("org.files.view") ? [{ href: "/files", label: t("files.title"), icon: <FolderIcon /> }] : []),
    { href: "/settings/profile", label: t("shell.settings"), icon: <SettingsIcon /> },
  ]
  const groups = [
    {
      items: [
        { href: APP_HOME, label: t("shell.home"), icon: <HouseIcon /> },
        { href: "/notifications", label: t("inbox.title"), icon: <InboxIcon />, count: unread ?? 0 },
      ],
    },
    ...(moduleLinks.length ? [{ label: t("home.modules"), items: moduleLinks }] : []),
    ...(ctx.isPlatformAdmin ? [{ items: [{ href: "/admin", label: t("admin.link"), icon: <ShieldIcon /> }] }] : []),
  ]

  return (
    <AppShell
      search
      orgId={ctx.org.id}
      header={<OrgSwitcher orgs={ctx.orgs} current={ctx.org} />}
      groups={groups}
      bar={<OrgBar org={ctx.org} links={links} />}
      me={{ name: me?.full_name || ctx.email, email: ctx.email, avatar: me?.avatar_path ?? null, memberArea: !!myContact }}
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
