import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sitePath } from "@/lib/url"
import type { SectionProps } from "../sections"

const PAID = ["paid", "partially_refunded"]
// The person's ticket orders: bought with their email (shop) or issued to it (guest lists).
const orders = (orgId: string, email: string) =>
  createAdminClient()
    .from("pay_orders")
    .select("id, metadata, amount_total, currency, paid_at, source_module, tickets(id, status, events(title, slug, starts_at, venue_name))")
    .eq("org_id", orgId)
    .ilike("customer_email", email.replace(/[%_\\]/g, (c) => `\\${c}`))
    .in("source_module", ["tickets", "guestlists"])
    .in("status", PAID)
    .order("paid_at", { ascending: false })
    .limit(50)

/** Has this contact ever got tickets here? Decides whether the "Tickets" tab shows. */
export async function hasTickets(orgId: string, contactId: string) {
  const { data: c } = await createAdminClient().from("contacts").select("email").eq("id", contactId).eq("org_id", orgId).maybeSingle()
  if (!c?.email) return false
  const { data } = await orders(orgId, c.email)
  return !!data?.some((o) => o.tickets.length)
}

// "Meine Tickets": upcoming events first, each with its ticket page (QR codes, PDF). Only this person's orders.
export async function TicketsSection({ orgId, site, contact, tab }: SectionProps) {
  if (tab !== "tickets" || !contact.email) return null
  const t = await getT()
  const { data } = await orders(orgId, contact.email)
  const now = new Date().getTime()
  const list = (data ?? [])
    .map((o) => {
      const ev = o.tickets.find((k) => k.events)?.events
      const valid = o.tickets.filter((k) => k.status === "valid" || k.status === "used").length
      return { id: o.id, token: (o.metadata as Record<string, unknown>)?.ticket_token as string | undefined, ev, valid, total: o.tickets.length }
    })
    .filter((o) => o.ev && o.total)
    .sort((a, b) => {
      const [x, y] = [new Date(a.ev!.starts_at).getTime(), new Date(b.ev!.starts_at).getTime()]
      return (x < now ? 1 : 0) - (y < now ? 1 : 0) || (x < now ? y - x : x - y) // upcoming soonest first, then past newest first
    })
  if (!list.length) return <p className="text-muted-foreground">{t("portal.tickets.none")}</p>
  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-lg font-semibold">{t("portal.tabs.tickets")}</h2>
      <ul className="grid gap-3">
        {list.map((o) => {
          const past = new Date(o.ev!.starts_at).getTime() < now
          return (
            <li key={o.id} className={`grid gap-1 rounded-xl border bg-card p-4 ${past ? "opacity-60" : ""}`}>
              <span className="font-medium">{o.ev!.title}</span>
              <span className="text-sm text-muted-foreground">
                {t.date(o.ev!.starts_at, { dateStyle: "full", timeStyle: "short" })}
                {o.ev!.venue_name && ` · ${o.ev!.venue_name}`}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {t("portal.tickets.count", { count: o.valid })}
                {o.valid < o.total && <Badge variant="outline">{t("portal.tickets.refunded", { count: o.total - o.valid })}</Badge>}
                {o.token && o.valid > 0 && (
                  <Link href={sitePath(site, `/t/${o.id}?k=${o.token}`)} className="ml-auto font-medium text-primary underline-offset-4 hover:underline">
                    {t("portal.tickets.open")}
                  </Link>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
