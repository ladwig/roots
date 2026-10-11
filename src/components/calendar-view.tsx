"use client"

import { useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { de, enGB } from "date-fns/locale"
import { toast } from "sonner"
import { EventCalendar } from "@/components/reui/event-calendar/event-calendar"
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content"
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav"
import type { CalendarEvent, CalendarView as View, EventCalendarResource } from "@/components/reui/event-calendar/event-calendar-types"
import { useT } from "@/i18n/client"

// Generic calendar for any module (shifts, events, bookings…), built on the ReUI event calendar (src/components/reui).
// - View + date live in the URL (?view=week&date=2026-10-12), so every view is shareable and survives reload.
// - Click an entry → its href (usually "?edit=<id>" / "?shift=<id>" opening a drawer). Click an empty slot →
//   newHref + &start=…&end=…(&resource=…) to create something there.
// - Optional drag & drop: `onMove` (a server action) gets the new times; it returns an error text to reject.
// - "resource" view = one column per person/room; pass `resourceEvents` (entries with resourceId) for it.
export type CalendarItem = { id: string; title: string; start: string; end: string; color?: string; href?: string; resourceId?: string; readOnly?: boolean }

export function CalendarView({
  events,
  resourceEvents,
  resources,
  views = ["month", "week", "day", "agenda"],
  defaultView = "week",
  newHref,
  onMove,
  className = "h-[70dvh] min-h-[480px]",
}: {
  events: CalendarItem[]
  resourceEvents?: CalendarItem[]
  resources?: EventCalendarResource[]
  views?: View[]
  defaultView?: View
  newHref?: string
  onMove?: (id: string, start: string, end: string) => Promise<{ error?: string } | void>
  className?: string
}) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const view = (views.find((v) => v === sp.get("view")) ?? defaultView) as View
  const dateParam = sp.get("date")
  const date = useMemo(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T12:00:00`) : new Date()), [dateParam])
  const source = view === "resource" && resourceEvents ? resourceEvents : events
  const items: CalendarEvent<{ href?: string }>[] = useMemo(
    () =>
      source.map((e) => ({
        id: e.id,
        title: e.title,
        start: new Date(e.start),
        end: new Date(e.end),
        color: e.color,
        resourceId: e.resourceId,
        readOnly: e.readOnly ?? !onMove,
        data: { href: e.href },
      })),
    [source, onMove],
  )

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    router.replace(`${pathname}?${next}`, { scroll: false })
  }
  const go = (href: string) => router.push(href.startsWith("?") ? `${pathname}${href}` : href, { scroll: false })
  const iso = (d: Date) => d.toISOString()
  const day = (d: Date) => d.toLocaleDateString("sv-SE")

  return (
    <EventCalendar<{ href?: string }>
      events={items}
      view={view}
      date={date}
      views={views}
      resources={view === "resource" ? resources : undefined}
      locale={t.locale === "de" ? de : enGB}
      timeZone="Europe/Berlin"
      weekStartsOn={1}
      dayStartHour={0}
      dayEndHour={24}
      interactions={{ drag: !!onMove, resize: !!onMove, selectSlot: !!newHref }}
      i18n={
        t.locale === "de"
          ? {
              labels: { today: "Heute", allDay: "Ganztägig", noEvents: "Keine Einträge", more: (n: number) => `+${n} weitere` },
              viewNames: { month: "Monat", week: "Woche", day: "Tag", days: (n: number) => `${n} Tage`, agenda: "Liste", resource: "Personen" },
            }
          : { viewNames: { agenda: "List", resource: "People" } }
      }
      onViewChange={(v) => setParams({ view: v })}
      onDateChange={(d) => setParams({ date: day(d) })}
      onEventClick={(occ, e) => {
        const href = occ.event.data?.href
        if (href) {
          e.preventDefault()
          go(href)
        }
      }}
      onSlotClick={(slot) => {
        if (!newHref) return
        const end = slot.end ?? new Date(slot.date.getTime() + (slot.allDay ? 8 : 4) * 3600_000)
        const start = slot.allDay ? new Date(new Date(slot.date).setHours(18, 0, 0, 0)) : slot.date
        go(`${newHref}&start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(slot.allDay ? new Date(start.getTime() + 6 * 3600_000) : end))}${slot.resourceId ? `&resource=${slot.resourceId}` : ""}`)
      }}
      onEventUpdate={
        onMove
          ? (u) => {
              onMove(String(u.event.id), iso(u.start), iso(u.end)).then((r) => {
                if (r && "error" in r && r.error) {
                  toast.error(r.error)
                  router.refresh()
                } else router.refresh()
              })
              return true
            }
          : undefined
      }
      className={className}
    >
      <EventCalendarNav />
      <EventCalendarContent />
    </EventCalendar>
  )
}
