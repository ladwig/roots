"use client"

import Link from "next/link"
import { EllipsisIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"

/**
 * The ⋯ button in a page header: everything that isn't the main action (import, export, trash, duplicate, delete).
 * Icons are elements (icon={<Trash2Icon />}): server pages can't pass components into this client file.
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

export function MenuLink({ href, icon, children, destructive }: { href: string; icon?: React.ReactNode; children: React.ReactNode; destructive?: boolean }) {
  return (
    <DropdownMenuItem render={<Link href={href} scroll={false} />} variant={destructive ? "destructive" : "default"}>
      {icon} {children}
    </DropdownMenuItem>
  )
}

export function MenuDownload({ href, icon, children }: { href: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <DropdownMenuItem render={<a href={href} />}>
      {icon} {children}
    </DropdownMenuItem>
  )
}

// Destructive items ask first (<ConfirmHost>); `confirm` = the question's message key.
export function MenuSubmit({ form, icon, children, destructive, confirm = "common.confirmTrash" }: { form: string; icon?: React.ReactNode; children: React.ReactNode; destructive?: boolean; confirm?: string }) {
  return (
    <DropdownMenuItem render={<button type="submit" form={form} className="w-full" data-confirm={destructive ? confirm : undefined} />} nativeButton variant={destructive ? "destructive" : "default"}>
      {icon} {children}
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
