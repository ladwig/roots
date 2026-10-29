"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { within } from "@/lib/url"

// Sub-pages of an area (Einstellungen, Dateien): a column from md, a scrolling row on phones. Most specific match is current.
export function SectionNav({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  const current = items
    .filter((i) => within(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
  return (
    <nav aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:w-48 md:shrink-0 md:flex-col md:overflow-visible md:px-0">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.href === current ? "page" : undefined}
          className="inline-flex min-h-8 shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
