"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"
import { CheckIcon, ChevronsUpDownIcon, LanguagesIcon, LogOutIcon, UserIcon } from "lucide-react"
import { signOut } from "@/app/login/actions"
import { OrgSwitcher } from "@/components/org-switcher"
import { Picture } from "@/components/picture"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { setLocale } from "@/i18n/actions"
import { useT } from "@/i18n/client"
import { localeNames, locales } from "@/i18n/config"

export type SidebarLink = { href: string; label: string; icon: React.ReactNode; count?: number }
type Org = { id: string; name: string; logo_path?: string | null }

export function AppSidebar({
  orgs,
  org,
  groups,
  me,
}: {
  orgs: Org[]
  org: Org
  groups: { label?: string; items: SidebarLink[] }[]
  me: { name: string; email: string; avatar: string | null }
}) {
  const t = useT()
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher orgs={orgs} current={org} />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g, i) => (
          <SidebarGroup key={i}>
            {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarMenu aria-label={g.label ?? t("shell.mainNav")}>
              {g.items.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton
                    isActive={isActive(n.href)}
                    tooltip={n.label}
                    render={<Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined} onClick={() => setOpenMobile(false)} />}
                  >
                    {n.icon}
                    <span>{n.label}</span>
                  </SidebarMenuButton>
                  {!!n.count && <SidebarMenuBadge className="tabular-nums">{n.count}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu me={me} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function UserMenu({ me }: { me: { name: string; email: string; avatar: string | null } }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form id="sign-out" action={signOut} hidden />
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" disabled={pending} className="data-popup-open:bg-sidebar-accent" />}>
            <Picture path={me.avatar} name={me.name} size="sm" />
            <span className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{me.name}</span>
              {me.name !== me.email && <span className="truncate text-xs text-muted-foreground">{me.email}</span>}
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">{me.email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings/profile" />}>
              <UserIcon /> {t("account.link")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2">
                <LanguagesIcon className="size-4" /> {t("common.language")}
              </DropdownMenuLabel>
              {locales.map((l) => (
                <DropdownMenuItem
                  key={l}
                  onClick={() =>
                    start(async () => {
                      await setLocale(l)
                      router.refresh()
                    })
                  }
                >
                  <span className="flex-1">{localeNames[l]}</span>
                  {l === t.locale && <CheckIcon />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem nativeButton render={<button type="submit" form="sign-out" className="w-full" />}>
              <LogOutIcon /> {t("auth.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
