import { z } from "zod"
import { parseTags } from "@/app/(app)/contacts/fields"
import { AUTOMATION_EVENTS } from "@/email/events"
import { BASE_PLACEHOLDERS, contactVars, FORMATS, renderMail } from "@/email/render"
import { queueCampaign, resolveAudience, sendProblem, type Audience } from "@/email/server"
import { defaultLocale, messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { sendOrgEmail } from "@/lib/org-email"
import { APP_URL } from "@/lib/url"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

// Texts that end up in emails (unsubscribe link, test name, error messages for the caller): German for now.
const t = createT(defaultLocale, messages[defaultLocale])

const Format = z.enum(FORMATS as ["text", "rich", "html"]).describe("rich = HTML from the editor (styles get inlined), html = own full HTML, text = plain text")
const AudienceSchema = z
  .object({
    tags: z.array(z.string().max(40)).max(20).default([]).describe("Contacts with any of these tags"),
    members: z.enum(["active"]).nullable().default(null).describe('"active" = contacts with an active membership (members module)'),
  })
  .strict()
const CampaignStatus = z.enum(["draft", "scheduled", "sending", "sent"])
const Campaign = z.object({
  id: uuid,
  name: z.string(),
  subject: z.string(),
  status: CampaignStatus,
  send_at: ts.nullable().describe("When a scheduled campaign goes out"),
  recipients: z.number().int().describe("Queued recipients (set when sending starts)"),
  created_at: ts,
  updated_at: ts,
})
const CAMPAIGN_COLS = "id, name, subject, status, send_at, recipients, created_at, updated_at"
const CampaignDetail = Campaign.extend({
  body: z.string(),
  format: Format,
  audience: z.object({ tags: z.array(z.string()), members: z.enum(["active"]).nullable() }),
  deleted_at: ts.nullable(),
  stats: z
    .object({
      sent: z.number().int(),
      queued: z.number().int().describe("Waiting or being sent"),
      failed: z.number().int(),
      skipped: z.number().int().describe("Unsubscribed or deleted meanwhile"),
      delivered: z.number().int(),
      bounced: z.number().int(),
      complained: z.number().int(),
    })
    .nullable()
    .describe("Once sending started (null for drafts and scheduled campaigns)"),
})
const DETAIL_COLS = "id, name, subject, status, send_at, recipients, created_at, updated_at, body, format, audience, deleted_at"

const Automation = z.object({
  id: uuid,
  name: z.string(),
  event_type: z.string().describe("Hub event that starts it, see GET /email/automation-events"),
  delay_minutes: z.number().int(),
  subject: z.string(),
  body: z.string(),
  format: Format,
  active: z.boolean(),
  created_at: ts,
  updated_at: ts,
})
const AUTOMATION_COLS = "id, name, event_type, delay_minutes, subject, body, format, active, created_at, updated_at"
const EventType = z.enum(AUTOMATION_EVENTS.map((e) => e.type) as [string, ...string[]])

const Send = z.object({
  id: uuid,
  campaign_id: uuid.nullable(),
  automation_id: uuid.nullable(),
  contact_id: uuid.nullable(),
  to_email: z.string(),
  status: z.enum(["queued", "sending", "sent", "failed", "skipped"]),
  delivery: z.enum(["delayed", "delivered", "bounced", "complained"]).nullable().describe("Provider feedback (never downgraded)"),
  delivery_at: ts.nullable(),
  send_after: ts,
  sent_at: ts.nullable(),
  error: z.string().nullable(),
  created_at: ts,
})
const SEND_COLS = "id, campaign_id, automation_id, contact_id, to_email, status, delivery, delivery_at, send_after, sent_at, error, created_at"

const ok = z.object({ ok: z.literal(true) })
const membersOn = async (db: Db, orgId: string) => (await db.rpc("module_enabled", { p_org: orgId, p_key: "members" })).data === true
// Normalised like the App's tag picker; the members audience needs the members module.
async function audienceOf(db: Db, orgId: string, a: z.infer<typeof AudienceSchema>): Promise<Audience> {
  if (a.members && !(await membersOn(db, orgId))) throw new ApiError(422, "module_disabled", "The members audience needs the members module.")
  return { tags: parseTags(a.tags.join(",")).slice(0, 20), members: a.members }
}

async function getCampaign(db: Db, orgId: string, id: string, deleted = false) {
  let q = db.from("email_campaigns").select(DETAIL_COLS).eq("id", id).eq("org_id", orgId)
  q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
  const { data } = await q.maybeSingle()
  if (!data) throw notFound()
  const audience = data.audience as Audience
  return { ...data, audience: { tags: audience.tags ?? [], members: audience.members ?? null } }
}
// The campaign as returned: delivery statistics once sending started (counted like the App's campaign page).
async function campaign(db: Db, orgId: string, id: string) {
  const c = await getCampaign(db, orgId, id)
  if (c.status === "draft" || c.status === "scheduled") return { ...c, stats: null }
  const { data } = await db.from("email_sends").select("status, delivery").eq("campaign_id", c.id).eq("org_id", orgId).limit(50000)
  const rows = data ?? []
  const n = (k: "status" | "delivery", ...v: string[]) => rows.filter((r) => v.includes(r[k] ?? "")).length
  return {
    ...c,
    stats: {
      sent: n("status", "sent"),
      queued: n("status", "queued", "sending"),
      failed: n("status", "failed"),
      skipped: n("status", "skipped"),
      delivered: n("delivery", "delivered"),
      bounced: n("delivery", "bounced"),
      complained: n("delivery", "complained"),
    },
  }
}
const notEditable = () => new ApiError(409, "already_sent", "This campaign is already sending or sent.")

async function automationEvent(db: Db, orgId: string, type: string) {
  const event = AUTOMATION_EVENTS.find((e) => e.type === type)!
  if (event.module && !(await db.rpc("module_enabled", { p_org: orgId, p_key: event.module })).data)
    throw new ApiError(422, "module_disabled", `The event "${type}" needs the "${event.module}" module.`)
}

export const endpoints: Endpoint[] = [
  // Campaigns
  endpoint({
    method: "GET",
    path: "/email/campaigns",
    permission: "email.view",
    tag: "Email",
    summary: "List campaigns",
    description: "Last changed first. `deleted=true` lists the trash instead.",
    query: page.extend({ status: CampaignStatus.optional(), deleted: z.stringbool().default(false) }),
    response: list(Campaign),
    async handler({ db, orgId, query }) {
      let q = db.from("email_campaigns").select(CAMPAIGN_COLS).eq("org_id", orgId).order("updated_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      q = query.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
      if (query.status) q = q.eq("status", query.status)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/email/campaigns/{id}",
    permission: "email.view",
    tag: "Email",
    summary: "Get a campaign",
    description: "With body, audience and, once sending started, delivery statistics.",
    response: CampaignDetail,
    async handler({ db, orgId, params }) {
      return campaign(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/email/campaigns",
    permission: "email.manage",
    tag: "Email",
    summary: "Create a campaign",
    description:
      "A draft. Placeholders in subject and body: {first_name}, {last_name}, {name}, {email}, {org}. Every email gets an unsubscribe link; unsubscribed contacts are skipped. Send it with POST /email/campaigns/{id}/send.",
    body: z
      .object({
        name: z.string().trim().min(1).max(200),
        subject: z.string().trim().max(300).optional().describe("Defaults to the name"),
        body: z.string().max(200000).default(""),
        format: Format.default("rich"),
        audience: AudienceSchema.optional(),
      })
      .strict(),
    response: CampaignDetail,
    status: 201,
    async handler({ db, orgId, body }) {
      const audience = body.audience ? await audienceOf(db, orgId, body.audience) : {}
      const { data, error } = await db
        .from("email_campaigns")
        .insert({ org_id: orgId, name: body.name, subject: body.subject ?? body.name, body: body.body, format: body.format, audience: audience as never })
        .select("id")
        .single()
      if (error) throw dbError(error)
      return campaign(db, orgId, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/email/campaigns/{id}",
    permission: "email.manage",
    tag: "Email",
    summary: "Change a campaign",
    description: "Only drafts and scheduled campaigns (a scheduled one stays scheduled).",
    body: z
      .object({ name: z.string().trim().min(1).max(200), subject: z.string().trim().max(300), body: z.string().max(200000), format: Format, audience: AudienceSchema })
      .partial()
      .strict(),
    response: CampaignDetail,
    async handler({ db, orgId, params, body }) {
      const c = await getCampaign(db, orgId, params.id)
      if (c.status === "sending" || c.status === "sent") throw notEditable()
      const { audience, ...rest } = body
      const patch = audience ? { ...rest, audience: (await audienceOf(db, orgId, audience)) as never } : rest
      const { error } = await db.from("email_campaigns").update(patch).eq("id", params.id).eq("org_id", orgId).in("status", ["draft", "scheduled"])
      if (error) throw dbError(error)
      return campaign(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/email/campaigns/{id}/send",
    permission: "email.manage",
    tag: "Email",
    summary: "Send or schedule a campaign",
    description:
      "Without `send_at`: queues one email per recipient now (contacts of the audience with an email, not unsubscribed, each address once); the worker sends them within minutes. With a future `send_at`: schedules it (cancel with /unschedule). Needs a subject, a body and an audience.",
    body: z.object({ send_at: z.iso.datetime({ offset: true }).optional() }).strict(),
    response: CampaignDetail,
    async handler({ db, orgId, params, body }) {
      const c = await getCampaign(db, orgId, params.id)
      if (c.status === "sending" || c.status === "sent") throw notEditable()
      const problem = sendProblem(c)
      if (problem) throw new ApiError(422, problem === "email.audienceRequired" ? "audience_required" : "subject_body_required", t(problem))
      if (body.send_at) {
        if (new Date(body.send_at) <= new Date()) throw new ApiError(422, "invalid_send_at", "send_at must be in the future.")
        const { error } = await db.from("email_campaigns").update({ status: "scheduled", send_at: new Date(body.send_at).toISOString() }).eq("id", params.id).eq("org_id", orgId)
        if (error) throw dbError(error)
      } else {
        try {
          await queueCampaign(db, orgId, params.id, c.audience)
        } catch (e) {
          throw dbError(e as { code?: string; message: string })
        }
      }
      return campaign(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/email/campaigns/{id}/unschedule",
    permission: "email.manage",
    tag: "Email",
    summary: "Unschedule a campaign",
    description: "A scheduled campaign goes back to draft.",
    response: CampaignDetail,
    async handler({ db, orgId, params }) {
      const c = await getCampaign(db, orgId, params.id)
      if (c.status !== "scheduled") throw new ApiError(409, "not_scheduled", "This campaign is not scheduled.")
      const { error } = await db.from("email_campaigns").update({ status: "draft", send_at: null }).eq("id", params.id).eq("org_id", orgId).eq("status", "scheduled")
      if (error) throw dbError(error)
      return campaign(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/email/campaigns/{id}/test",
    permission: "email.manage",
    tag: "Email",
    summary: "Send a test email",
    description: 'The saved campaign to one address, subject prefixed with "[Test]", placeholders filled with sample values. Sent right away through the org\'s email provider.',
    body: z.object({ to: z.email().max(320) }).strict(),
    response: ok,
    async handler({ db, orgId, params, body }) {
      const [c, { data: org }] = await Promise.all([getCampaign(db, orgId, params.id), db.from("orgs").select("name").eq("id", orgId).single()])
      const name = org?.name ?? ""
      const mail = renderMail(c, contactVars({ first_name: t("email.testFirstName"), last_name: null, company: null, email: body.to }, name), {
        org: name,
        unsubscribeUrl: `${APP_URL}/u/test`,
        unsubscribeLabel: t("email.unsubscribe"),
      })
      const sent = await sendOrgEmail(orgId, { to: body.to, ...mail, subject: `[Test] ${mail.subject}` }).catch(() => false)
      if (!sent) throw new ApiError(422, "no_provider", "The email could not be sent (no email provider configured or the provider refused it).")
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/email/campaigns/{id}",
    permission: "email.manage",
    tag: "Email",
    summary: "Move a campaign to the trash",
    description: "Not while it is sending. Queued emails of a deleted campaign are skipped. Restorable for 30 days.",
    response: ok,
    async handler({ db, orgId, params }) {
      const c = await getCampaign(db, orgId, params.id)
      if (c.status === "sending") throw new ApiError(409, "sending", "This campaign is being sent right now.")
      const { error } = await db.rpc("soft_delete", { p_table: "public.email_campaigns", p_id: params.id })
      if (error) throw dbError(error)
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "POST",
    path: "/email/campaigns/{id}/restore",
    permission: "email.manage",
    tag: "Email",
    summary: "Restore a campaign from the trash",
    response: CampaignDetail,
    async handler({ db, orgId, params }) {
      await getCampaign(db, orgId, params.id, true)
      const { error } = await db.rpc("restore_deleted", { p_table: "public.email_campaigns", p_id: params.id })
      if (error) throw dbError(error)
      return campaign(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "GET",
    path: "/email/audience",
    permission: "email.view",
    tag: "Email",
    summary: "Count an audience",
    description: "How many people a campaign with this audience would reach right now (contacts with an email, not unsubscribed, each address once).",
    query: z.object({
      tags: z.string().max(1000).optional().describe("Comma-separated tags"),
      members: z.enum(["active"]).optional(),
    }),
    response: z.object({ count: z.number().int() }),
    async handler({ db, orgId, query }) {
      const audience = await audienceOf(db, orgId, { tags: query.tags ? query.tags.split(",") : [], members: query.members ?? null })
      if (!audience.tags?.length && !audience.members) return { count: 0 }
      return { count: (await resolveAudience(db, orgId, audience)).length }
    },
  }),

  // Automations
  endpoint({
    method: "GET",
    path: "/email/automation-events",
    permission: "email.view",
    tag: "Email",
    summary: "Events an automation can react to",
    description: "With the placeholders each one offers in subject and body.",
    response: z.object({ data: z.array(z.object({ type: z.string(), module: z.string(), placeholders: z.array(z.string()) })) }),
    async handler() {
      return { data: AUTOMATION_EVENTS.map((e) => ({ type: e.type, module: e.module, placeholders: [...BASE_PLACEHOLDERS, ...e.vars] })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/email/automations",
    permission: "email.view",
    tag: "Email",
    summary: "List automations",
    response: z.object({ data: z.array(Automation) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("email_automations").select(AUTOMATION_COLS).eq("org_id", orgId).order("event_type").order("delay_minutes")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/email/automations/{id}",
    permission: "email.view",
    tag: "Email",
    summary: "Get an automation",
    response: Automation,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("email_automations").select(AUTOMATION_COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/email/automations",
    permission: "email.manage",
    tag: "Email",
    summary: "Create an automation",
    description:
      "When the event happens, one email goes to the contact it is about, after `delay_minutes`. Several automations on the same event = a sequence. Unsubscribed contacts are skipped.",
    body: z
      .object({
        name: z.string().trim().min(1).max(200),
        event_type: EventType,
        delay_minutes: z.number().int().min(0).max(525600).default(0),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(200000),
        format: Format.default("rich"),
        active: z.boolean().default(true),
      })
      .strict(),
    response: Automation,
    status: 201,
    async handler({ db, orgId, body }) {
      await automationEvent(db, orgId, body.event_type)
      const { data, error } = await db.from("email_automations").insert({ ...body, org_id: orgId }).select(AUTOMATION_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/email/automations/{id}",
    permission: "email.manage",
    tag: "Email",
    summary: "Change an automation",
    description: "Also switches it on or off (`active`).",
    body: z
      .object({
        name: z.string().trim().min(1).max(200),
        event_type: EventType,
        delay_minutes: z.number().int().min(0).max(525600),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(200000),
        format: Format,
        active: z.boolean(),
      })
      .partial()
      .strict(),
    response: Automation,
    async handler({ db, orgId, params, body }) {
      if (body.event_type) await automationEvent(db, orgId, body.event_type)
      const { data, error } = await db.from("email_automations").update(body).eq("id", params.id).eq("org_id", orgId).select(AUTOMATION_COLS).maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/email/automations/{id}",
    permission: "email.manage",
    tag: "Email",
    summary: "Delete an automation",
    description: "Its queued emails are removed too; the log of sent ones goes with it.",
    response: ok,
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("email_automations").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw dbError(error)
      if (!data.length) throw notFound()
      return { ok: true as const }
    },
  }),

  // Queue + log
  endpoint({
    method: "GET",
    path: "/email/sends",
    permission: "email.view",
    tag: "Email",
    summary: "Email log",
    description: "Every queued, sent, failed or skipped email of campaigns and automations, newest first, with delivery feedback from the provider.",
    query: page.extend({
      status: z.enum(["queued", "sending", "sent", "failed", "skipped"]).optional(),
      delivery: z.enum(["delayed", "delivered", "bounced", "complained"]).optional(),
      campaign_id: uuid.optional(),
      automation_id: uuid.optional(),
      contact_id: uuid.optional(),
      since: z.iso.datetime({ offset: true }).optional().describe("Created after"),
    }),
    response: list(Send),
    async handler({ db, orgId, query }) {
      let q = db.from("email_sends").select(SEND_COLS).eq("org_id", orgId).order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit)
      if (query.status) q = q.eq("status", query.status)
      if (query.delivery) q = q.eq("delivery", query.delivery)
      if (query.campaign_id) q = q.eq("campaign_id", query.campaign_id)
      if (query.automation_id) q = q.eq("automation_id", query.automation_id)
      if (query.contact_id) q = q.eq("contact_id", query.contact_id)
      if (query.since) q = q.gt("created_at", query.since)
      const { data } = await q
      return paged(data, query)
    },
  }),
]
