import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rentalState } from "@/rentals/fields"
import type { SectionProps } from "../sections"

const person = (c: { first_name: string | null; last_name: string | null; company: string | null } | null) => (c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "" : "")

/** Does this contact rent anything here (live, not cancelled)? Decides whether the "Meine Miete" tab shows. */
export async function hasRentals(orgId: string, contactId: string) {
  const { count } = await createAdminClient()
    .from("rental_contacts")
    .select("id, rentals!inner(id)", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .is("rentals.deleted_at", null)
    .neq("rentals.status", "cancelled")
  return (count ?? 0) > 0
}

// "Meine Miete": the person's running and upcoming rentals (object, period, the people on it; rent, deposit and notice
// only for main tenants) and the keys/things handed out to them. Reads only rows of this contact in this org.
export async function RentalsSection({ orgId, contact, tab }: SectionProps) {
  if (tab !== "rental") return null
  const t = await getT()
  const { data } = await createAdminClient()
    .from("rental_contacts")
    .select("role, rentals!inner(id, status, starts_at, ends_at, price_cents, unit, deposit_cents, notice_months, notice_at, deleted_at, rental_objects(name, kind, family), rental_contacts(role, contacts(first_name, last_name, company)))")
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .is("rentals.deleted_at", null)
    .neq("rentals.status", "cancelled")
  const now = new Date()
  const mine = (data ?? []).filter((x) => ["running", "upcoming"].includes(rentalState(x.rentals, now)))
  const places = mine.filter((x) => x.rentals.rental_objects?.family !== "access")
  const keys = mine.filter((x) => x.rentals.rental_objects?.family === "access")
  const day = (v: string) => t.date(v, { dateStyle: "medium" })
  const kind = (k: string) => (t.has(`rentals.kinds.${k}`) ? t.dynamic(`rentals.kinds.${k}`) : k)
  const box = "grid gap-3 rounded-xl border bg-card p-5"

  if (!mine.length) return <p className="py-8 text-center text-muted-foreground">{t("rentals.portalNone")}</p>
  return (
    <section className="grid gap-6">
      {places.map(({ role, rentals: r }) => (
        <div key={r.id} className={box}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{r.rental_objects?.name}</h2>
            <Badge variant={rentalState(r, now) === "running" ? "default" : "secondary"}>{t.dynamic(`rentals.states.${rentalState(r, now)}`)}</Badge>
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("rentals.kind")}</dt>
            <dd>{r.rental_objects ? kind(r.rental_objects.kind) : ""}</dd>
            <dt className="text-muted-foreground">{t("rentals.whenTitle")}</dt>
            <dd>{r.ends_at ? `${day(r.starts_at)} – ${day(r.ends_at)}` : t("rentals.since", { date: day(r.starts_at) })}</dd>
            <dt className="text-muted-foreground">{t("rentals.portalRole")}</dt>
            <dd>{t.dynamic(`rentals.roles.${role}`)}</dd>
            {role === "main" && r.price_cents != null && (
              <>
                <dt className="text-muted-foreground">{t("rentals.price")}</dt>
                <dd>
                  {t.money(r.price_cents)} {r.unit && t.dynamic(`rentals.units.${r.unit}`)}
                </dd>
              </>
            )}
            {role === "main" && r.deposit_cents != null && (
              <>
                <dt className="text-muted-foreground">{t("rentals.deposit")}</dt>
                <dd>{t.money(r.deposit_cents)}</dd>
              </>
            )}
            {role === "main" && r.notice_months != null && (
              <>
                <dt className="text-muted-foreground">{t("rentals.notice")}</dt>
                <dd>{r.notice_at ? t("rentals.noticeReceived", { date: day(r.notice_at) }) : t("rentals.noticeMonthsText", { count: r.notice_months })}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("rentals.people")}</dt>
            <dd>
              {r.rental_contacts
                .map((p) => `${person(p.contacts)} (${t.dynamic(`rentals.roles.${p.role}`)})`)
                .join(", ")}
            </dd>
          </dl>
        </div>
      ))}
      {keys.length > 0 && (
        <div className={box}>
          <h2 className="font-heading text-lg font-semibold">{t("rentals.keys")}</h2>
          <ul className="grid gap-1 text-sm">
            {keys.map(({ rentals: r }) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0 flex-1 font-medium">{r.rental_objects?.name}</span>
                <span className="text-muted-foreground">{t("rentals.since", { date: day(r.starts_at) })}</span>
                {r.deposit_cents != null && <span className="text-muted-foreground">· {t("rentals.deposit")} {t.money(r.deposit_cents)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
