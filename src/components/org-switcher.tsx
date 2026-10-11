"use client"

import Link from "next/link"
import { useTransition } from "react"
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { switchOrg } from "@/app/(app)/actions"
import { useT } from "@/i18n/client"
import { Picture } from "@/components/picture"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type Org = { id: string; name: string; logo_path?: string | null }

export function OrgSwitcher({ orgs, current }: { orgs: Org[]; current: Org }) {
  const t = useT()
  const [pending, start] = useTransition()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" disabled={pending} className="data-popup-open:bg-sidebar-accent" />}>
            <Picture path={current.logo_path} name={current.name} size="sm" square />
            <span className="flex-1 truncate text-left font-medium">{current.name}</span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-(--anchor-width) min-w-56">
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => o.id !== current.id && start(() => switchOrg(o.id))}>
                <Picture path={o.logo_path} name={o.name} size="sm" square />
                <span className="truncate">{o.name}</span>
                {o.id === current.id && <span className="ml-auto text-xs text-muted-foreground">{t("shell.current")}</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/onboarding" />}>
              <PlusIcon /> {t("shell.newOrg")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
