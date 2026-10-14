import Link from "next/link"
import { PlusIcon, type LucideIcon } from "lucide-react"
import { PageCrumbs } from "@/components/page-crumbs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NAV } from "@/modules/nav"
import { cn } from "@/lib/utils"

// The App's page anatomy (see /style/app): <Page> sets one of three widths, <PageHeader> is the same header everywhere,
// <RecordLayout> is a record page's two columns, <FormCard> groups fields by topic, <EmptyState> fills empty lists.

const WIDTH = { list: "max-w-6xl", record: "max-w-6xl", form: "max-w-3xl" }

/** list = lists, boards, calendars · record = a record's page (content + details column) · form = forms, setup, new. */
export function Page({ size = "list", className, children }: { size?: keyof typeof WIDTH; className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-6", WIDTH[size], className)}>{children}</div>
}

/**
 * Title row of every page. Right side, always in this order: `actions` (outline buttons, few), `menu` (the ⋯
 * <ActionsMenu> with import, export, trash, delete…), `primary` (the one filled button, "+ New …", key N).
 * `area` shows the area's icon from the nav (same icon as in the sidebar and ⌘K), `crumbs` the way back on record pages.
 */
export function PageHeader({
  title,
  area,
  crumbs,
  badge,
  meta,
  description,
  actions,
  menu,
  primary,
}: {
  title: React.ReactNode
  area?: string
  crumbs?: { href?: string; label: string }[]
  badge?: React.ReactNode
  meta?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  menu?: React.ReactNode
  primary?: { href: string; label: string; icon?: LucideIcon } | React.ReactNode
}) {
  const Icon = area ? NAV.find((a) => a.key === area)?.icon : undefined
  const isLink = (p: unknown): p is { href: string; label: string; icon?: LucideIcon } => !!p && typeof p === "object" && "href" in p && "label" in p
  const PrimaryIcon = isLink(primary) ? (primary.icon ?? PlusIcon) : null
  return (
    <header className="grid gap-3">
      {crumbs && <PageCrumbs items={crumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
              <Icon className="size-5" />
            </span>
          )}
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold break-words">{title}</h1>
              {badge}
            </div>
            {meta && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
            {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {(actions || menu || primary) && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {menu}
            {isLink(primary) && PrimaryIcon ? (
              <Button render={<Link href={primary.href} />} nativeButton={false} size="sm" data-shortcut="new">
                <PrimaryIcon /> {primary.label}
              </Button>
            ) : (
              (primary as React.ReactNode)
            )}
          </div>
        )}
      </div>
    </header>
  )
}

/** A record page: content on the left, a details/related column on the right. */
export function RecordLayout({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="grid min-w-0 gap-6">{children}</div>
      <aside className="grid min-w-0 gap-6">{aside}</aside>
    </div>
  )
}

/** Fields that belong together ("Adresse", "Bank & SEPA"), with an anchor id for deep links. */
export function FormCard({ id, title, description, action, className, children }: { id?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className={cn("scroll-mt-20", className)} aria-labelledby={id ? `${id}-h` : undefined}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle id={id ? `${id}-h` : undefined} role="heading" aria-level={2}>
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

/** Nothing here yet: the area's icon, what this is, and the way to the first record. */
export function EmptyState({ area, icon, title, text, action }: { area?: string; icon?: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  const Icon = icon ?? (area ? NAV.find((a) => a.key === area)?.icon : undefined)
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon && (
        <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-5" />
        </span>
      )}
      <div className="grid max-w-sm gap-1">
        <p className="font-medium">{title}</p>
        {text && <p className="text-sm text-muted-foreground">{text}</p>}
      </div>
      {action}
    </div>
  )
}
