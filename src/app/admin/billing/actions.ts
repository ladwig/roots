"use server"

import { thisMonth } from "@/billing/server"
import { monthRange } from "@/billing/pricing"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { moneyCents } from "@/lib/inputs"
import { requirePlatformAdmin } from "@/lib/context"
import { back } from "@/lib/url"
import { modules } from "@/modules/registry"

const PATH = "/admin/billing"
const cents = (fd: FormData, key: string) => (String(fd.get(key) ?? "").trim() ? moneyCents(String(fd.get(key))) : 0)
const whole = (fd: FormData, key: string, max: number) => {
  const n = Number(String(fd.get(key) ?? "0").trim() || 0)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null
}

/** A price from a future month on (the running and past months stay as they were billed). */
export async function savePrice(fd: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const target = String(fd.get("org") ?? "")
  const orgId = target === "default" ? null : /^[0-9a-f-]{36}$/.test(target) ? target : undefined
  const month = String(fd.get("month") ?? "")
  const here = `${PATH}?price=${target}&month=${String(fd.get("view") ?? thisMonth())}`
  if (orgId === undefined || !/^\d{4}-\d{2}$/.test(month)) back(here, { error: t("errors.invalid_input") })
  if (month <= thisMonth()) back(here, { error: t("admin.billing.onlyFuture") })

  const moduleCents: Record<string, number> = {}
  for (const m of modules) {
    const v = cents(fd, `module.${m.key}`)
    if (v === null) back(here, { error: t("admin.billing.invalidAmount") })
    if (v) moduleCents[m.key] = v
  }
  const percent = Number(String(fd.get("sales_percent") ?? "0").replace(",", ".") || 0)
  const row = {
    org_id: orgId,
    starts_on: monthRange(month).from,
    base_cents: cents(fd, "base"),
    module_cents: moduleCents,
    user_cents: cents(fd, "user"),
    included_users: whole(fd, "included_users", 100000),
    member_cents: cents(fd, "member"),
    included_members: whole(fd, "included_members", 1000000),
    sales_percent: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? Math.round(percent * 100) / 100 : null,
    sales_fixed_cents: cents(fd, "sales_fixed"),
    discount_percent: whole(fd, "discount_percent", 100),
    note: String(fd.get("note") ?? "").trim().slice(0, 500) || null,
  }
  const numbers = [row.base_cents, row.user_cents, row.included_users, row.member_cents, row.included_members, row.sales_percent, row.sales_fixed_cents, row.discount_percent]
  if (numbers.some((v) => v === null)) back(here, { error: t("admin.billing.invalidAmount") })

  // One price per org and month: replace a planned one for the same month.
  let q = supabase.from("org_prices").select("id").eq("starts_on", row.starts_on)
  q = orgId ? q.eq("org_id", orgId) : q.is("org_id", null)
  const { data: existing } = await q.maybeSingle()
  const { error } = existing
    ? await supabase.from("org_prices").update(row as never).eq("id", existing.id)
    : await supabase.from("org_prices").insert(row as never)
  back(here, error ? { error: dbError(t, error) } : { ok: t("admin.billing.saved") })
}

/** Remove a planned price (only future months). */
export async function deletePrice(fd: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const here = `${PATH}?price=${String(fd.get("org") ?? "")}&month=${String(fd.get("view") ?? thisMonth())}`
  const { error, count } = await supabase.from("org_prices").delete({ count: "exact" }).eq("id", id).gt("starts_on", monthRange(thisMonth()).from)
  back(here, error ? { error: dbError(t, error) } : count ? { ok: t("admin.billing.deleted") } : { error: t("admin.billing.onlyFuture") })
}
