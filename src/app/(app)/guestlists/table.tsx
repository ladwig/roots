import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

export const LIST_COLS = "id, name, event_id, door_price, quota, link_enabled, ticket_type_id, events(title, starts_at), artists(name), guest_entries(count)"
type Row = { id: string; name: string; event_id: string | null; door_price: number | null; quota: number | null; link_enabled: boolean; events: { title: string; starts_at: string } | null; artists: { name: string } | null; guest_entries: unknown }

/** Guest lists as a table (overview, and the event's "Gästelisten" tab without the event column). */
export function GuestListTable({ t, rows, withEvent = true, empty }: { t: T; rows: Row[]; withEvent?: boolean; empty: string }) {
  const count = (l: Row) => (l.guest_entries as { count: number }[])[0]?.count ?? 0
  return (
    <DataTable
      rows={rows}
      rowKey={(l) => l.id}
      rowHref={(l) => `/guestlists/${l.id}`}
      empty={empty}
      columns={[
        {
          header: t("guestlists.name"),
          cell: (l) => (
            <span className="grid">
              <span className="font-medium">{l.name}</span>
              {l.artists?.name && <span className="text-xs text-muted-foreground">{l.artists.name}</span>}
            </span>
          ),
        },
        ...(withEvent
          ? [{ header: t("guestlists.event"), cell: (l: Row) => (l.events ? `${l.events.title} · ${t.date(l.events.starts_at, { dateStyle: "short" })}` : <Badge variant="secondary">{t("guestlists.permanent")}</Badge>) }]
          : [{ header: "", cell: (l: Row) => (l.event_id ? null : <Badge variant="secondary">{t("guestlists.permanent")}</Badge>) }]),
        { header: t("guestlists.entries"), cell: (l) => `${count(l)}${l.quota ? ` / ${l.quota}` : ""}`, className: "tabular-nums" },
        { header: t("guestlists.doorPrice"), cell: (l) => (l.door_price ? t.money(l.door_price) : t("guestlists.free")) },
        { header: t("guestlists.link"), cell: (l) => (l.link_enabled ? <Badge>{t("guestlists.linkOn")}</Badge> : null) },
      ]}
    />
  )
}
