import { CalendarView } from "@/components/calendar-view"
import { Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { peopleLine } from "../parts"

// Occupancy: rentable objects as columns (resource view) or one calendar; requests lighter. Click = the rental,
// empty slot / drag across = new booking for that object and time.
export default async function RentalCalendarPage() {
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const now = new Date()
  const from = new Date(now.getTime() - 120 * 86_400_000).toISOString()
  const [{ data: objects }, { data: rentals }] = await Promise.all([
    ctx.supabase.from("rental_objects").select("id, name").eq("org_id", ctx.org.id).is("deleted_at", null).eq("rentable", true).eq("status", "active").order("position").order("name").limit(200),
    ctx.supabase
      .from("rentals")
      .select("id, object_id, status, starts_at, ends_at, rental_objects!inner(name, rentable), rental_contacts(role, contacts(first_name, last_name, company, email))")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("rental_objects.rentable", true)
      .or(`ends_at.is.null,ends_at.gte.${from}`)
      .limit(3000),
  ])
  // ponytail: open-ended contracts are drawn for a year from today; long enough for the views here.
  const horizon = new Date(now.getTime() + 365 * 86_400_000).toISOString()
  const items = (rentals ?? []).map((r) => ({
    id: r.id,
    title: `${r.rental_objects.name} · ${peopleLine(r.rental_contacts, 1) || "–"}${r.status === "request" ? ` (${t("rentals.states.request")})` : ""}`,
    start: r.starts_at,
    end: r.ends_at ?? horizon,
    color: r.status === "request" ? "var(--chart-4)" : "var(--chart-1)",
    href: `/rentals/r/${r.id}`,
    resourceId: r.object_id,
    readOnly: true,
  }))
  return (
    <Page>
      <PageHeader area="rentals" title={t("rentals.tabs.calendar")} description={t("rentals.calendarHint")} />
      <CalendarView
        events={items}
        resourceEvents={items}
        resources={(objects ?? []).map((o) => ({ id: o.id, title: o.name }))}
        views={["resource", "month", "week", "agenda"]}
        defaultView="month"
        newHref={ctx.can("rentals.manage") ? "/rentals/r/new?x=1" : undefined}
        newMinutes={120}
      />
    </Page>
  )
}

export const instant = false
