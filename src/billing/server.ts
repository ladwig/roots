// Prices from the database (org_prices): the one that applies now (sales fee at order time) and the monthly overview
// for platform admins (/admin/billing).
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { FREE, monthRange, monthlyBill, priceFor, type Price } from "./pricing"

export type PriceRow = Database["public"]["Tables"]["org_prices"]["Row"]
const asPrice = (r: PriceRow): Price => ({ ...r, sales_percent: Number(r.sales_percent), module_cents: (r.module_cents ?? {}) as Record<string, number> })
export const thisMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 7)

/** The price that applies to an org today (its own, else the default, else free). */
export async function currentPrice(orgId: string): Promise<Price> {
  const { from } = monthRange(thisMonth())
  const { data } = await createAdminClient().from("org_prices").select("*").or(`org_id.eq.${orgId},org_id.is.null`).lte("starts_on", from)
  const rows = data ?? []
  const p = priceFor(rows.filter((r) => r.org_id), rows.filter((r) => !r.org_id), from)
  return p ? asPrice(p) : FREE
}

/** One month for every live org: its price, usage and bill. `db` = the platform admin's client (RPC checks it). */
export async function monthOverview(db: SupabaseClient<Database>, month: string) {
  const { from, to } = monthRange(month)
  const [{ data: usage, error }, { data: prices }, { data: orgs }] = await Promise.all([
    db.rpc("billing_usage", { p_from: from, p_to: to }),
    db.from("org_prices").select("*").order("starts_on"),
    db.from("orgs").select("id, name, slug").is("deleted_at", null).order("name"),
  ])
  if (error) throw error
  const defaults = (prices ?? []).filter((p) => !p.org_id)
  return (orgs ?? []).map((o) => {
    const own = (prices ?? []).filter((p) => p.org_id === o.id)
    const row = priceFor(own, defaults, from)
    const price = row ? asPrice(row) : FREE
    const u = usage?.find((x) => x.org_id === o.id) ?? { users: 0, members: 0, modules: [], orders: 0, sales_cents: 0, fees_collected_cents: 0, fees_open_cents: 0 }
    const bill = monthlyBill(price, { users: u.users, members: u.members, modules: u.modules, fees_open_cents: Number(u.fees_open_cents) })
    return { org: o, priceSource: row ? (row.org_id ? "own" : "default") : "none", price, usage: u, bill, ownPrices: own }
  })
}
