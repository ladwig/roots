"use client"

import Link from "next/link"
import { useTransition } from "react"
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { switchOrg } from "@/app/(app)/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Org = { id: string; name: string }

export function OrgSwitcher({ orgs, current }: { orgs: Org[]; current: Org }) {
  const [pending, start] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="w-full justify-between md:w-full" disabled={pending} />}
      >
        <span className="truncate">{current.name}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => o.id !== current.id && start(() => switchOrg(o.id))}>
            <span className="truncate">{o.name}</span>
            {o.id === current.id && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/onboarding" />}>
          <PlusIcon /> New organisation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
