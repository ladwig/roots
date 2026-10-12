"use server"

import { parseTags } from "@/app/(app)/contacts/fields"
import { AUTOMATION_EVENTS } from "@/email/events"
import { contactVars, FORMATS, renderMail } from "@/email/render"
import { queueCampaign, type Audience } from "@/email/server"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { sendOrgEmail } from "@/lib/org-email"
import { fromLocalInput } from "@/lib/time"
import { APP_URL, back } from "@/lib/url"

const PATH = "/email"
const AUTO = "/email/automations"
const formatOf = (fd: FormData) => FORMATS.find((f) => f === fd.get("format")) ?? "text"
const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max)

async function manager(path = PATH) {
  const ctx = await requirePerm("email.manage")
  const t = await getT()
  if (!ctx.modules.has("email")) back(path, { error: t("errors.not_allowed") })
  return { ctx, t }
}

export async function createCampaign(fd: FormData) {
  const { ctx, t } = await manager()
  const name = str(fd, "name", 200)
  if (!name) back(`${PATH}?new=1`, { error: t("email.nameRequired") })
  const { data, error } = await ctx.supabase.from("email_campaigns").insert({ org_id: ctx.org.id, name, subject: name }).select("id").single()
  if (error || !data) back(`${PATH}?new=1`, { error: dbError(t, error) })
  back(`${PATH}/${data.id}`, {})
}

function readCampaign(fd: FormData, members: boolean) {
  const audience: Audience = { tags: parseTags(String(fd.get("tags") ?? "")).slice(0, 20), members: members && fd.get("members") === "active" ? "active" : null }
  return { name: str(fd, "name", 200), subject: str(fd, "subject", 300), body: String(fd.get("body") ?? "").slice(0, 200000), format: formatOf(fd), audience }
}

/** Save; the submit button decides what else happens: "test" (to me), "send" (now), "schedule" (at send_at). */
export async function saveCampaign(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36)
  const here = `${PATH}/${id}`
  const c = readCampaign(fd, ctx.modules.has("members"))
  if (!c.name) back(here, { error: t("email.nameRequired") })
  const { data: current } = await ctx.supabase.from("email_campaigns").select("status").eq("id", id).eq("org_id", ctx.org.id).single()
  if (!current || current.status === "sending" || current.status === "sent") back(here, { error: t("email.alreadySent") })
  const { error } = await ctx.supabase.from("email_campaigns").update({ ...c, audience: c.audience as never }).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })

  const intent = fd.get("intent")
  if (intent === "test") {
    const mail = renderMail(c, contactVars({ first_name: t("email.testFirstName"), last_name: null, company: null, email: ctx.email }, ctx.org.name), {
      org: ctx.org.name,
      unsubscribeUrl: `${APP_URL}/u/test`,
      unsubscribeLabel: t("email.unsubscribe"),
    })
    const ok = await sendOrgEmail(ctx.org.id, { to: ctx.email, ...mail, subject: `[Test] ${mail.subject}` }).catch(() => false)
    back(here, ok ? { ok: t("email.testSent", { email: ctx.email }) } : { error: t("email.noProvider") })
  }
  if (intent === "send" || intent === "schedule") {
    if (!c.subject || !c.body.replace(/<[^>]+>/g, "").trim()) back(here, { error: t("email.subjectBodyRequired") })
    if (!c.audience.tags?.length && !c.audience.members) back(here, { error: t("email.audienceRequired") })
    if (intent === "schedule") {
      const at = fromLocalInput(str(fd, "send_at", 20))
      if (!at || at <= new Date()) back(here, { error: t("email.scheduleInvalid") })
      await ctx.supabase.from("email_campaigns").update({ status: "scheduled", send_at: at.toISOString() }).eq("id", id).eq("org_id", ctx.org.id)
      back(here, { ok: t("email.scheduled") })
    }
    let n = 0
    try {
      n = await queueCampaign(ctx.supabase, ctx.org.id, id, c.audience)
    } catch (e) {
      back(here, { error: dbError(t, e as { message?: string }) })
    }
    back(here, { ok: t("email.queued", { count: n }) })
  }
  back(here, { ok: t("email.saved") })
}

export async function unscheduleCampaign(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36)
  await ctx.supabase.from("email_campaigns").update({ status: "draft", send_at: null }).eq("id", id).eq("org_id", ctx.org.id).eq("status", "scheduled")
  back(`${PATH}/${id}`, { ok: t("email.unscheduled") })
}

export async function trashCampaign(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.email_campaigns", p_id: str(fd, "id", 36) })
  back(PATH, error ? { error: dbError(t, error) } : { ok: t("email.trashed") })
}

export async function saveAutomation(fd: FormData) {
  const { ctx, t } = await manager(AUTO)
  const id = str(fd, "id", 36)
  const event = AUTOMATION_EVENTS.find((e) => e.type === fd.get("event_type"))
  const unit = ({ minutes: 1, hours: 60, days: 1440 } as Record<string, number>)[String(fd.get("unit"))] ?? 1440
  const row = {
    name: str(fd, "name", 200),
    event_type: event?.type ?? "",
    delay_minutes: Math.min(525600, Math.max(0, Math.round(Number(fd.get("delay")) || 0) * unit)),
    subject: str(fd, "subject", 300),
    body: String(fd.get("body") ?? "").slice(0, 200000),
    format: formatOf(fd),
    active: fd.get("active") === "on",
  }
  if (!row.name || !event || !row.subject || !row.body.trim()) back(AUTO, { error: t("email.automationInvalid") })
  if (event.module && !ctx.modules.has(event.module)) back(AUTO, { error: t("errors.not_allowed") })
  const { error } = id
    ? await ctx.supabase.from("email_automations").update(row).eq("id", id).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("email_automations").insert({ ...row, org_id: ctx.org.id })
  back(AUTO, error ? { error: dbError(t, error) } : { ok: t("email.saved") })
}

export async function deleteAutomation(fd: FormData) {
  const { ctx, t } = await manager(AUTO)
  const { error } = await ctx.supabase.from("email_automations").delete().eq("id", str(fd, "id", 36)).eq("org_id", ctx.org.id)
  back(AUTO, error ? { error: dbError(t, error) } : { ok: t("email.deleted") })
}
