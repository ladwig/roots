"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { appRoute } from "@/lib/url"
import { cn } from "@/lib/utils"

export function NavLink({ href, children, className, exact }: { href: string; children: React.ReactNode; className?: string; exact?: boolean }) {
  const pathname = appRoute(usePathname())
  const target = appRoute(href)
  const active = target === "/" || exact ? pathname === target : pathname.startsWith(target)
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground",
        className
      )}
    >
      {children}
    </Link>
  )
}
