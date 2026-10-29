"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrgSwitcher } from "@/components/org-switcher"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { appRoute, within } from "@/lib/url"

// Top bar of the App: the org switcher (logo + name) and its always-reachable areas (Dateien, Einstellungen).
export function OrgBar({
  org,
  orgs,
  links,
}: {
  org: { id: string; name: string; logo_path?: string | null }
  orgs: { id: string; name: string; logo_path?: string | null }[]
  links: { href: string; label: string; icon: React.ReactNode }[]
}) {
  const pathname = usePathname()
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <OrgSwitcher orgs={orgs} current={org} />
      <nav aria-label={org.name} className="ml-auto flex items-center gap-1">
        {links.map((l) => {
          const area = appRoute(l.href).split("/").slice(0, 2).join("/") // /settings/team → area /settings
          const active = within(pathname, area)
          return (
            <Tooltip key={l.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={l.href}
                    aria-label={l.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4",
                      active && "bg-accent text-foreground",
                    )}
                  />
                }
              >
                {l.icon}
                <span className="hidden md:inline">{l.label}</span>
              </TooltipTrigger>
              <TooltipContent>{l.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </div>
  )
}
