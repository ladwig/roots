import Link from "next/link"
import { ActivityIcon, ArrowLeftIcon, BuildingIcon, ShieldIcon, UsersIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { getT } from "@/i18n/server"
import { requirePlatformAdmin } from "@/lib/context"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformAdmin()
  const t = await getT()
  const { data: me } = await session.supabase.from("profiles").select("full_name, avatar_path").eq("id", session.userId).maybeSingle()
  return (
    <AppShell
      header={
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t("admin.backToApp")} render={<Link href="/" />}>
              <ArrowLeftIcon />
              <span>{t("admin.backToApp")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      }
      groups={[
        {
          label: t("admin.title"),
          items: [
            { href: "/admin/orgs", label: t("admin.orgs.title"), icon: <BuildingIcon /> },
            { href: "/admin/users", label: t("admin.users.title"), icon: <UsersIcon /> },
            { href: "/admin/roles", label: t("admin.roles.title"), icon: <ShieldIcon /> },
            { href: "/admin/activity", label: t("admin.activity.title"), icon: <ActivityIcon /> },
          ],
        },
      ]}
      me={{ name: me?.full_name || session.email, email: session.email, avatar: me?.avatar_path ?? null }}
      title={t("admin.title")}
    >
      <div className="mx-auto grid max-w-5xl gap-6">{children}</div>
    </AppShell>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
