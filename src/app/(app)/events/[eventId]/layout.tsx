import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarClockIcon, ExternalLinkIcon, ListChecksIcon, ScanLineIcon } from "lucide-react"
import { NavLink } from "@/components/nav-link"
import { PageCrumbs } from "@/components/page-crumbs"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { StatusBadge } from "../event-form"

// One event: header (title, date, status, public page) and its own tabs; shifts, guest lists and the door are the
// other areas, filtered to this event.
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound()
  const ctx = await requirePerm("events.view")
  if (!ctx.modules.has("events")) notFound()
  const t = await getT()
  const { data: ev } = await ctx.supabase.from("events").select("id, title, slug, status, starts_at, deleted_at").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle()
  if (!ev) notFound()
  const on = (m: string, p: string) => ctx.modules.has(m) && ctx.can(p)
  const link = "inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
  return (
    <div className="grid max-w-6xl gap-6">
      <PageCrumbs items={[{ href: "/events", label: t("eventsPage.nav") }, { label: ev.title }]} />
      <header className="grid gap-2">
        <h1 className="font-heading text-2xl font-semibold break-words">{ev.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-muted-foreground">{t.date(ev.starts_at, { dateStyle: "full", timeStyle: "short" })}</span>
          <StatusBadge t={t} status={ev.status} />
          {ev.status !== "draft" && !ev.deleted_at && (
            <a href={siteUrl(ctx.org.slug, `/e/${ev.slug}`)} target="_blank" rel="noreferrer" className={link}>
              {t("eventsPage.publicLink")} <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
          {on("shifts", "shifts.view") && (
            <Link href={`/shifts?event=${ev.id}`} className={link}>
              <CalendarClockIcon className="size-3.5" /> {t("shifts.title")}
            </Link>
          )}
          {on("guestlists", "guestlists.view") && (
            <Link href={`/guestlists?event=${ev.id}`} className={link}>
              <ListChecksIcon className="size-3.5" /> {t("guestlists.title")}
            </Link>
          )}
          {(on("tickets", "tickets.scan") || on("guestlists", "guestlists.checkin")) && (
            <Link href={`/scan?event=${ev.id}`} className={link}>
              <ScanLineIcon className="size-3.5" /> {t("tickets.scanNav")}
            </Link>
          )}
        </div>
      </header>
      {!ev.deleted_at && (
        <nav aria-label={ev.title} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
          <NavLink href={`/events/${ev.id}`} exact>
            {t("nav.overview")}
          </NavLink>
          <NavLink href={`/events/${ev.id}/lineup`}>{t("lineup.title")}</NavLink>
          {on("tickets", "tickets.view") && <NavLink href={`/events/${ev.id}/tickets`}>{t("tickets.title")}</NavLink>}
        </nav>
      )}
      {children}
    </div>
  )
}

export const instant = false
