import type { SupabaseClient } from "@supabase/supabase-js"
import { getT } from "@/i18n/server"
import { sendOrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { APP_URL } from "@/lib/url"
import { contactVars, renderMail } from "./render"

type Db = SupabaseClient<Database>
export type Audience = { tags?: string[]; members?: "active" | null }

/** Who a campaign goes to: live contacts with an email, not unsubscribed, with any of the tags and/or an active membership. */
export async function resolveAudience(db: Db, orgId: string, audience: Audience) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const out = new Map<string, string>() // email → contact id
  for (let from = 0; from < 50_000; from += 1000) {
    let q = audience.members === "active"
      ? db
          .from("contacts")
          .select("id, email, memberships!inner(id)")
          .is("memberships.deleted_at", null)
          .lte("memberships.starts_on", today)
          .or(`ends_on.is.null,ends_on.gte.${today}`, { referencedTable: "memberships" })
      : db.from("contacts").select("id, email")
    q = q.eq("org_id", orgId).is("deleted_at", null).is("unsubscribed_at", null).not("email", "is", null).order("id").range(from, from + 999)
    if (audience.tags?.length) q = q.overlaps("tags", audience.tags)
    const { data } = await q
    data?.forEach((c) => c.email && out.set(c.email, c.id))
    if ((data?.length ?? 0) < 1000) break
  }
  return [...out].map(([email, id]) => ({ email, id }))
}

/** Put a campaign's recipients into the queue (idempotent per address) and mark it sending. */
export async function queueCampaign(db: Db, orgId: string, campaignId: string, audience: Audience) {
  const people = await resolveAudience(db, orgId, audience)
  for (let i = 0; i < people.length; i += 500) {
    const { error } = await db
      .from("email_sends")
      .upsert(
        people.slice(i, i + 500).map((p) => ({ org_id: orgId, campaign_id: campaignId, contact_id: p.id, to_email: p.email })),
        { onConflict: "campaign_id,to_email", ignoreDuplicates: true },
      )
    if (error) throw error
  }
  await db.from("email_campaigns").update({ status: "sending", recipients: people.length }).eq("id", campaignId).eq("org_id", orgId)
  return people.length
}

/** Worker: start due scheduled campaigns, send a batch of the queue, close finished campaigns. Returns emails sent. */
export async function processEmailQueue(limit = 100) {
  const db = createAdminClient()
  const t = await getT()
  // Sends stuck in "sending" (worker died mid-batch) go back to the queue.
  await db.from("email_sends").update({ status: "queued" }).eq("status", "sending").lt("claimed_at", new Date(Date.now() - 15 * 60_000).toISOString())
  const { data: due } = await db.from("email_campaigns").select("id, org_id, audience").eq("status", "scheduled").lte("send_at", new Date().toISOString()).is("deleted_at", null)
  for (const c of due ?? []) await queueCampaign(db, c.org_id, c.id, c.audience as Audience).catch(console.error)

  const { data: batch } = await db.rpc("claim_email_sends", { p_limit: limit })
  let sent = 0
  if (batch?.length) {
    const ids = (k: "campaign_id" | "automation_id" | "contact_id" | "org_id") => [...new Set(batch.map((s) => s[k]).filter((v): v is string => !!v))]
    const [{ data: campaigns }, { data: automations }, { data: contacts }, { data: orgs }] = await Promise.all([
      db.from("email_campaigns").select("id, subject, body, format, deleted_at").in("id", ids("campaign_id")),
      db.from("email_automations").select("id, subject, body, format, active").in("id", ids("automation_id")),
      db.from("contacts").select("id, first_name, last_name, company, email, unsubscribed_at, deleted_at").in("id", ids("contact_id")),
      db.from("orgs").select("id, name").in("id", ids("org_id")),
    ])
    for (const s of batch) {
      const tpl = s.campaign_id ? campaigns?.find((c) => c.id === s.campaign_id && !c.deleted_at) : automations?.find((a) => a.id === s.automation_id && a.active)
      const contact = contacts?.find((c) => c.id === s.contact_id) ?? null
      const org = orgs?.find((o) => o.id === s.org_id)?.name ?? ""
      if (!tpl || contact?.unsubscribed_at || contact?.deleted_at) {
        await db.from("email_sends").update({ status: "skipped" }).eq("id", s.id)
        continue
      }
      const unsubscribeUrl = `${APP_URL}/u/${s.id}`
      const mail = renderMail(tpl, { ...(s.vars as object), ...contactVars(contact, org) }, { org, unsubscribeUrl, unsubscribeLabel: t("email.unsubscribe") })
      try {
        const ok = await sendOrgEmail(s.org_id, {
          to: s.to_email,
          ...mail,
          headers: { "List-Unsubscribe": `<${APP_URL}/api/unsubscribe/${s.id}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: { send_id: s.id },
        })
        await db.from("email_sends").update(ok ? { status: "sent", sent_at: new Date().toISOString() } : { status: "failed", error: "No email provider configured" }).eq("id", s.id)
        if (ok) sent++
      } catch (e) {
        await db.from("email_sends").update({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", s.id)
      }
    }
  }
  // Campaigns with nothing left in the queue are done.
  const { data: sending } = await db.from("email_campaigns").select("id").eq("status", "sending")
  for (const c of sending ?? []) {
    const { count } = await db.from("email_sends").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["queued", "sending"])
    if (!count) await db.from("email_campaigns").update({ status: "sent" }).eq("id", c.id)
  }
  return sent
}

/** Unsubscribe the contact behind a send (link in every email). */
export async function unsubscribe(sendId: string) {
  if (!/^[0-9a-f-]{36}$/.test(sendId)) return null
  const db = createAdminClient()
  const { data: s } = await db.from("email_sends").select("contact_id, to_email, org_id, orgs(name)").eq("id", sendId).maybeSingle()
  if (!s) return null
  if (s.contact_id) await db.from("contacts").update({ unsubscribed_at: new Date().toISOString() }).eq("id", s.contact_id).is("unsubscribed_at", null)
  await db.from("email_sends").update({ status: "skipped" }).eq("org_id", s.org_id).eq("to_email", s.to_email).eq("status", "queued")
  return { org: s.orgs?.name ?? "" }
}

const DELIVERY_RANK = { delayed: 1, delivered: 2, bounced: 3, complained: 4 } as const
export type Delivery = keyof typeof DELIVERY_RANK

/**
 * Provider feedback for a send (webhook). Never downgrades (a late "delivered" doesn't undo "bounced").
 * Hard bounce or spam complaint → the contact is unsubscribed so they get no more campaign/automation mails.
 * `orgId` limits it to that org's sends (webhooks signed with an org's own secret).
 * ponytail: bounces reuse unsubscribed_at instead of a separate "bounced" flag; split it if the UI needs to tell them apart.
 */
export async function recordDelivery(sendId: string, delivery: Delivery, opts: { at?: string; hard?: boolean; orgId?: string } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(sendId)) return
  const db = createAdminClient()
  const lower = Object.keys(DELIVERY_RANK).filter((k) => DELIVERY_RANK[k as Delivery] < DELIVERY_RANK[delivery])
  let q = db
    .from("email_sends")
    .update({ delivery, delivery_at: opts.at ?? new Date().toISOString() })
    .eq("id", sendId)
    .or(`delivery.is.null,delivery.in.(${lower.join(",") || "none"})`)
  if (opts.orgId) q = q.eq("org_id", opts.orgId)
  const { data, error } = await q.select("id")
  if (error) throw error
  if (data.length && (delivery === "complained" || (delivery === "bounced" && opts.hard))) await unsubscribe(sendId)
}
