"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { sendOrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"
import { back, siteActionPath, siteUrl } from "@/lib/url"
import { earliestEnd, type Interval } from "@/members/dues"
import { createLoginToken, getPortalContact, signIn, signOut } from "@/portal/session"
import { getSite } from "../data"

const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max) || null
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

async function site(fd: FormData) {
  const slug = String(fd.get("site") ?? "")
  const s = await getSite(slug)
  if (!s) redirect("/")
  return { slug, org: s.org, here: siteActionPath(slug, "/portal") }
}

/** Email a login link. Same answer whether or not the address is known (no member lookup from outside). */
export async function requestLink(fd: FormData) {
  const t = await getT()
  const { slug, org, here } = await site(fd)
  const email = str(fd, "email", 320)?.toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(here, { error: t("errors.invalid_email") })
  // ponytail: simple flood guard per address (3 links per 10 minutes); a per-IP limit if the form gets abused.
  const db = createAdminClient()
  const { data: contact } = await db.from("contacts").select("id").eq("org_id", org.id).eq("email", email).is("deleted_at", null).maybeSingle()
  const { count } = contact
    ? await db.from("portal_tokens").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("kind", "login").gt("created_at", new Date(Date.now() - 600_000).toISOString())
    : { count: 0 }
  if ((count ?? 0) < 3) {
    const login = await createLoginToken(org.id, email)
    if (login) {
      const link = `${siteUrl(slug, "/portal/login")}?token=${login.token}`
      const text = [t("portal.mailHello", { name: login.firstName ?? "" }), "", t("portal.mailIntro", { org: org.name }), "", link, "", t("portal.mailNote")].join("\n")
      await sendOrgEmail(org.id, {
        to: email,
        subject: t("portal.mailSubject", { org: org.name }),
        text,
        html: `<div style="font:15px/1.6 system-ui,sans-serif">${text
          .split("\n")
          .map((l) => (l === link ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#15803d;color:#fff;border-radius:8px;text-decoration:none">${t("portal.mailButton")}</a></p>` : `<p style="margin:0 0 8px">${l.replace(/[<>&]/g, "")}</p>`))
          .join("")}</div>`,
      }).catch(console.error)
    }
  }
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
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) back(here, { error: t("errors.invalid_iban") })
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
