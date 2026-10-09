"use client"

import Link from "next/link"
import { useTransition } from "react"
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { switchOrg } from "@/app/(app)/actions"
import { useT } from "@/i18n/client"
import { Picture } from "@/components/picture"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Org = { id: string; name: string; logo_path?: string | null }

export function OrgSwitcher({ orgs, current }: { orgs: Org[]; current: Org }) {
  const t = useT()
  const [pending, start] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="w-full justify-between md:w-full" disabled={pending} />}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Picture path={current.logo_path} name={current.name} size="sm" square />
          <span className="truncate">{current.name}</span>
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
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
  )
}
