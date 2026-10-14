"use client"

import Link from "next/link"
import { EllipsisIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"

/**
 * The ⋯ button in a page header: everything that isn't the main action (import, export, trash, duplicate, delete).
 * Items: <MenuLink> (navigation, drawers via ?param), <MenuDownload> (files), <MenuSubmit form="<form id>"> (posts a
 * hidden <form id=…> on the page, so actions stay plain server-action forms), <MenuSeparator>.
 */
export function ActionsMenu({ children, label }: { children: React.ReactNode; label?: string }) {
  const t = useT()
  const text = label ?? t("common.moreActions")
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label={text} />} />}>
          <EllipsisIcon />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MenuLink({ href, icon: Icon, children, destructive }: { href: string; icon?: LucideIcon; children: React.ReactNode; destructive?: boolean }) {
  return (
    <DropdownMenuItem render={<Link href={href} scroll={false} />} variant={destructive ? "destructive" : "default"}>
      {Icon && <Icon />} {children}
    </DropdownMenuItem>
  )
}

export function MenuDownload({ href, icon: Icon, children }: { href: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <DropdownMenuItem render={<a href={href} />}>
      {Icon && <Icon />} {children}
    </DropdownMenuItem>
  )
}

export function MenuSubmit({ form, icon: Icon, children, destructive }: { form: string; icon?: LucideIcon; children: React.ReactNode; destructive?: boolean }) {
  return (
    <DropdownMenuItem render={<button type="submit" form={form} className="w-full" />} nativeButton variant={destructive ? "destructive" : "default"}>
      {Icon && <Icon />} {children}
    </DropdownMenuItem>
  )
}

/** "Export" group: Excel + CSV of what the list shows (pass its filters as `query`). */
export function MenuExport({ entity, query = {}, label }: { entity: string; query?: Record<string, string | undefined>; label?: string }) {
  const t = useT()
  const href = (format: string) => `/export/${entity}?${new URLSearchParams(Object.entries({ ...query, format }).filter((x): x is [string, string] => !!x[1]))}`
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label ?? t("export.button")}</DropdownMenuLabel>
      <DropdownMenuItem render={<a href={href("xlsx")} />}>{t("export.xlsx")}</DropdownMenuItem>
      <DropdownMenuItem render={<a href={href("csv")} />}>{t("export.csv")}</DropdownMenuItem>
    </DropdownMenuGroup>
  )
}

export const MenuSeparator = DropdownMenuSeparator
