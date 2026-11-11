"use client"

import Link from "next/link"
import { ChevronDownIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** "Vertrag erstellen": one contract template opens it right away, several are offered in a menu. */
export function ContractMenu({ label, items, chooseHref }: { label: string; items: { href: string; label: string }[]; chooseHref: string }) {
  if (items.length <= 1)
    return (
      <Button render={<Link href={items[0]?.href ?? chooseHref} />} nativeButton={false} size="sm" variant="outline">
        <FileTextIcon /> {label}
      </Button>
    )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
        <FileTextIcon /> {label} <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {items.map((i) => (
          <DropdownMenuItem key={i.href} render={<Link href={i.href} />}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
