"use client"

import Link, { useLinkStatus } from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { appRoute, within } from "@/lib/url"
import { useState, useTransition } from "react"
import { CheckIcon, ChevronsLeftRightIcon, ChevronsUpDownIcon, IdCardIcon, LanguagesIcon, Loader2Icon, LogOutIcon, UserIcon } from "lucide-react"
import { openMyMemberArea } from "@/app/(app)/actions"
import { signOut } from "@/app/login/actions"
import { CommandSearch } from "@/components/command-search"
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { setLocale } from "@/i18n/actions"
import { useT } from "@/i18n/client"
import { localeNames, locales } from "@/i18n/config"

// The item's icon, or a spinner while its page loads (instant feedback on click, before the server answers).
function NavIcon({ icon }: { icon: React.ReactNode }) {
  const { pending } = useLinkStatus()
  return pending ? <Loader2Icon className="animate-spin" /> : icon
}

export type SidebarLink = { href: string; label: string; icon: React.ReactNode; count?: number; newTab?: boolean; children?: { href: string; label: string }[] } // children: sub-pages (the area opens the first)
export type Me = { name: string; email: string; avatar: string | null; memberArea?: boolean } // memberArea: linked to a contact of the org

export function AppSidebar({
  header,
  groups,
  me,
  search,
}: {
  header: React.ReactNode
  groups: { label?: string; items: SidebarLink[] }[]
  me: Me
  search?: boolean
}) {
  const t = useT()
  const pathname = appRoute(usePathname())
  const { setOpenMobile } = useSidebar()
  // The clicked item looks active right away; once the URL changed, the path decides again.
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null)
  const target = clicked && clicked.from === pathname ? appRoute(clicked.href) : null
  const matches = (href: string, path: string) => within(path, href)
  const isActive = (href: string) => (target ? matches(href, target) : matches(href, pathname))
  const here = target ?? pathname
  // Sub-pages: the most specific match wins (/members/dues over /members); an area is active if one of them is.
  const activeChild = (children: { href: string }[]) =>
    children.filter((c) => matches(c.href, here)).sort((a, b) => appRoute(b.href).length - appRoute(a.href).length)[0]?.href
  const go = (href: string) => {
    setOpenMobile(false)
    setClicked({ href, from: pathname })
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {header}
        {search && <CommandSearch />}
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g, i) => (
          <SidebarGroup key={i}>
            {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarMenu aria-label={g.label ?? t("shell.mainNav")}>
              {g.items.map((n) => {
                const current = n.children ? activeChild(n.children) : undefined
                const active = n.children ? !!current : isActive(n.href)
                return (
                  <SidebarMenuItem key={n.href}>
                    <SidebarMenuButton
                      isActive={active && !(n.children && n.children.length > 1)}
                      tooltip={n.label}
                      render={
                        n.newTab ? (
                          <a href={n.href} target="_blank" rel="noreferrer" />
                        ) : (
                          <Link href={n.href} aria-current={active ? "page" : undefined} onClick={() => go(n.href)} />
                        )
                      }
                    >
                      {n.newTab ? n.icon : <NavIcon icon={n.icon} />}
                      <span>{n.label}</span>
                    </SidebarMenuButton>
                    {!!n.count && <SidebarMenuBadge className="tabular-nums">{n.count}</SidebarMenuBadge>}
                    {/* Sub-pages of the current area only: moving to another area collapses this one. */}
                    {active && n.children && n.children.length > 1 && (
                      <SidebarMenuSub>
                        {n.children.map((c) => (
                          <SidebarMenuSubItem key={c.href}>
                            <SidebarMenuSubButton isActive={c.href === current} render={<Link href={c.href} aria-current={c.href === current ? "page" : undefined} onClick={() => go(c.href)} />}>
                              <span>{c.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu me={me} />
      </SidebarFooter>
      {/* Open/close on the sidebar's edge (desktop): a <> handle appears on hover. */}
      <SidebarRail className="group/rail">
        <span className="pointer-events-none absolute top-1/2 left-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/rail:opacity-100">
          <ChevronsLeftRightIcon className="size-3.5" />
        </span>
      </SidebarRail>
    </Sidebar>
  )
}

function UserMenu({ me }: { me: Me }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form id="sign-out" action={signOut} hidden />
        {me.memberArea && <form id="member-area" action={openMyMemberArea} hidden />}
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
            {me.memberArea && (
              <DropdownMenuItem nativeButton render={<button type="submit" form="member-area" className="w-full" />}>
                <IdCardIcon /> {t("account.memberArea")}
              </DropdownMenuItem>
            )}
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

// Top bar: where you are (area icon + name › sub-page), from the same nav tree as the sidebar.
export function PageTitle({ groups, fallback }: { groups: { items: SidebarLink[] }[]; fallback: string }) {
  const pathname = appRoute(usePathname())
  const matches = (href: string) => within(pathname, href)
  const longest = <T extends { href: string }>(l: T[]) => l.filter((x) => matches(x.href)).sort((a, b) => appRoute(b.href).length - appRoute(a.href).length)[0]
  const area = longest(groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? []).map((c) => ({ ...c, icon: i.icon, parent: i }))])))
  if (!area) return <span className="truncate text-sm font-medium">{fallback}</span>
  const parent = "parent" in area ? (area.parent as SidebarLink) : area
  const sub = "parent" in area && parent.children?.[0]?.href !== area.href ? area.label : null
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
      {parent.icon}
      <span className="truncate">{parent.label}</span>
      {sub && <span className="truncate text-muted-foreground">› {sub}</span>}
    </span>
  )
}
