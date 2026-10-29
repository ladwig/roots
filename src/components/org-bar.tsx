"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Picture } from "@/components/picture"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { APP_HOME, appRoute, within } from "@/lib/url"

// Top bar of the App: the org (logo + name) and its always-reachable areas (Dateien, Einstellungen).
export function OrgBar({
  org,
  links,
}: {
  org: { name: string; logo_path?: string | null }
  links: { href: string; label: string; icon: React.ReactNode }[]
}) {
  const pathname = usePathname()
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Link href={APP_HOME} className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Picture path={org.logo_path} name={org.name} size="sm" square />
        <span className="hidden truncate sm:block">{org.name}</span>
      </Link>
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
