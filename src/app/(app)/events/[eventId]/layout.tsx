import { notFound } from "next/navigation"
import { CalendarClockIcon, ExternalLinkIcon, EyeOffIcon, ScanLineIcon, SendIcon, Trash2Icon } from "lucide-react"
import { NavLink } from "@/components/nav-link"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { SubmitButton } from "@/components/submit-button"
import { PageHeader } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { setEventStatus, trashEvent } from "../actions"
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
  const canManage = ctx.can("events.manage")
  return (
    <div className="grid max-w-6xl gap-6">
      <PageHeader
        crumbs={[{ href: "/events", label: t("eventsPage.nav") }, { label: ev.title }]}
        title={ev.title}
        badge={<StatusBadge t={t} status={ev.status} />}
        meta={t.date(ev.starts_at, { dateStyle: "full", timeStyle: "short" })}
        actions={
          ev.status !== "draft" &&
          !ev.deleted_at && (
            <Button render={<a href={siteUrl(ctx.org.slug, `/e/${ev.slug}`, ctx.org.site_domain)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
              <ExternalLinkIcon /> {t("eventsPage.publicLink")}
            </Button>
          )
        }
        menu={
          !ev.deleted_at &&
          (canManage || on("shifts", "shifts.view") || on("tickets", "tickets.scan") || on("guestlists", "guestlists.checkin")) && (
            <ActionsMenu>
              {on("shifts", "shifts.view") && (
                <MenuLink href={`/shifts?event=${ev.id}`} icon={<CalendarClockIcon />}>
                  {t("shifts.title")}
                </MenuLink>
              )}
              {(on("tickets", "tickets.scan") || on("guestlists", "guestlists.checkin")) && (
                <MenuLink href={`/scan?event=${ev.id}`} icon={<ScanLineIcon />}>
                  {t("tickets.scanNav")}
                </MenuLink>
              )}
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-event" icon={<Trash2Icon />} destructive>
                    {t("eventsPage.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
        primary={
          canManage &&
          !ev.deleted_at &&
          ev.status !== "cancelled" && (
            <form action={setEventStatus}>
              <input type="hidden" name="id" value={ev.id} />
              <input type="hidden" name="status" value={ev.status === "published" ? "draft" : "published"} />
              <SubmitButton size="sm" variant={ev.status === "published" ? "outline" : "default"}>
                {ev.status === "published" ? <EyeOffIcon /> : <SendIcon />} {ev.status === "published" ? t("eventsPage.unpublish") : t("eventsPage.publish")}
              </SubmitButton>
            </form>
          )
        }
      />
      {canManage && !ev.deleted_at && (
        <form id="trash-event" action={trashEvent} hidden>
          <input type="hidden" name="id" value={ev.id} />
        </form>
      )}
      {!ev.deleted_at && (
        <nav aria-label={ev.title} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
          <NavLink href={`/events/${ev.id}`} exact>
            {t("nav.overview")}
          </NavLink>
          <NavLink href={`/events/${ev.id}/lineup`}>{t("lineup.title")}</NavLink>
          {on("tickets", "tickets.view") && <NavLink href={`/events/${ev.id}/tickets`}>{t("tickets.title")}</NavLink>}
          {on("guestlists", "guestlists.view") && <NavLink href={`/events/${ev.id}/guestlists`}>{t("guestlists.title")}</NavLink>}
        </nav>
      )}
      {children}
    </div>
  )
}

export const instant = false
