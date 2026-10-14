"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { back, siteActionPath } from "@/lib/url"
import { earliestEnd, type Interval } from "@/members/dues"
import { sendLoginLink } from "@/portal/login"
import { getPortalContact, signIn, signOut } from "@/portal/session"
import { getSite } from "../data"
import { ibanValid } from "@/lib/inputs"

const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max) || null
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

async function site(fd: FormData) {
  const slug = String(fd.get("site") ?? "")
  const s = await getSite(slug)
  if (!s) redirect("/")
  // Back to the tab the form was on (?tab=data …).
  const tab = String(fd.get("tab") ?? "")
  return { slug, org: s.org, here: siteActionPath(slug, "/portal") + (/^[a-z]{1,20}$/.test(tab) ? `?tab=${tab}` : "") }
}

/** Email a login link. Same answer whether or not the address is known (no member lookup from outside). */
export async function requestLink(fd: FormData) {
  const t = await getT()
  const { slug, org, here } = await site(fd)
  const email = str(fd, "email", 320)?.toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(here, { error: t("errors.invalid_email") })
  if (!(await sendLoginLink(org, slug, email, t))) back(here, { error: t("portal.mailFailed") })
  redirect(`${here}?sent=1`)
}

export async function confirmLogin(fd: FormData) {
  const t = await getT()
  const { org, here } = await site(fd)
  const ok = await signIn(org.id, String(fd.get("token") ?? ""))
  back(here, ok ? {} : { error: t("portal.linkInvalid") })
}

export async function logout(fd: FormData) {
  const { org, here } = await site(fd)
  await signOut(org.id)
  redirect(here)
}

// ---------- members section ----------

async function member(fd: FormData) {
  const t = await getT()
  const s = await site(fd)
  const me = await getPortalContact(s.org.id)
  if (!me) back(s.here, { error: t("portal.signInFirst") })
  const db = createAdminClient()
  const { data: m } = await db
    .from("memberships")
    .select("id, member_no, ends_on, starts_on, types:membership_types(interval, notice_months)")
    .eq("org_id", s.org.id)
    .eq("contact_id", me.contact.id)
    .is("deleted_at", null)
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle()
  return { ...s, t, db, me, m }
}
const notify = (db: ReturnType<typeof createAdminClient>, orgId: string, m: { id: string; member_no: string | null }, name: string, what: string) =>
  db.rpc("emit_event", { p_org: orgId, p_type: "membership.self_updated", p_payload: { membership_id: m.id, number: m.member_no, name, what }, p_subject_table: "memberships", p_subject_id: m.id })

export async function updateMyData(fd: FormData) {
  const { t, db, me, m, org, here } = await member(fd)
  const { error } = await db
    .from("contacts")
    .update({ phone: str(fd, "phone", 50), street: str(fd, "street", 200), postal_code: str(fd, "postal_code", 20), city: str(fd, "city", 100) })
    .eq("id", me.contact.id)
    .eq("org_id", org.id)
  if (error) back(here, { error: t("errors.generic") })
  if (m) await notify(db, org.id, m, me.contact.first_name ?? "", t("portal.whatAddress"))
  deliverSoon()
  back(here, { ok: t("portal.saved") })
}

/** New bank details = a new SEPA mandate (signed today). */
export async function updateMyBank(fd: FormData) {
  const { t, db, me, m, org, here } = await member(fd)
  if (!m) back(here, { error: t("errors.not_allowed") })
  const iban = str(fd, "iban", 42)?.toUpperCase().replace(/\s/g, "") ?? ""
  const bic = str(fd, "bic", 11)?.toUpperCase().replace(/\s/g, "") || null
  if (!ibanValid(iban)) back(here, { error: t("errors.invalid_iban") })
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) back(here, { error: t("errors.invalid_bic") })
  if (fd.get("mandate_ok") !== "on") back(here, { error: t("errors.mandate_required") })
  const { data: cur } = await db.from("memberships").select("mandate_ref, number").eq("id", m.id).single()
  const { error } = await db
    .from("memberships")
    .update({ iban, bic, account_holder: str(fd, "account_holder", 70), mandate_signed_on: today(), mandate_ref: cur?.mandate_ref ?? `M${String(cur?.number ?? 0).padStart(6, "0")}` })
    .eq("id", m.id)
    .eq("org_id", org.id)
  if (error) back(here, { error: t("errors.generic") })
  await notify(db, org.id, m, me.contact.first_name ?? "", t("portal.whatBank"))
  deliverSoon()
  back(here, { ok: t("portal.saved") })
}

export async function cancelMyMembership(fd: FormData) {
  const { t, db, m, org, here } = await member(fd)
  if (!m?.types || m.ends_on) back(here, { error: t("errors.not_allowed") })
  if (fd.get("confirm") !== "on") back(here, { error: t("portal.confirmCancel") })
  const endsOn = earliestEnd(today(), m.types.notice_months, m.types.interval as Interval)
  const { error } = await db.from("memberships").update({ ends_on: endsOn < m.starts_on ? m.starts_on : endsOn }).eq("id", m.id).eq("org_id", org.id)
  if (error) back(here, { error: t("errors.generic") })
  deliverSoon() // membership.ended → board
  back(here, { ok: t("portal.cancelled", { date: t.date(endsOn) }) })
}
