// Mails an event sends on its own: tickets, guest-list tickets, waiting-list offers. The event's template, else the
// org's default template (both only with the email module on), else roots' built-in mail. Placeholders + the button
// come from src/email/render.ts (EVENT_PLACEHOLDERS), texts from email.eventMail.*.
import type { SupabaseClient } from "@supabase/supabase-js"
import { messages } from "@/i18n/config"
import { createT, type T } from "@/i18n/translate"
import { imageUrlOn } from "@/lib/images"
import { siteUrl } from "@/lib/url"
import { sendOrgEmail, type OrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { button, renderMail, type EventMailKind, type Vars } from "./render"

type Template = { subject: string; body: string; format: string }
type Case = { name: string; email: string; count: number; link: string; list?: string; until?: string }
type Ev = { title: string; starts_at: string; venue_name: string | null; venue_address: string | null }

// ponytail: German for now, like the other mails to buyers; the org's language later.
const tDe = () => createT("de", messages.de)

/** roots' built-in mail; also the starting point of a new template. */
export const builtInTemplate = (t: T): Template => ({
  subject: "{title}",
  body: `<p>${t("email.eventMail.greeting", { name: "{name}" })}</p><p>{message}</p><p>{button}</p>`,
  format: "rich",
})

export function eventMailVars(t: T, kind: EventMailKind, ev: Ev, org: string, c: Case): Vars {
  const v = { name: c.name, event: ev.title, when: t.date(ev.starts_at, { dateStyle: "full", timeStyle: "short" }), count: c.count, list: c.list ?? "", until: c.until ?? "" }
  return {
    ...v,
    email: c.email,
    org,
    venue: [ev.venue_name, ev.venue_address].filter(Boolean).join(", "),
    title: t.dynamic(`email.eventMail.${kind}.title`, v),
    message: t.dynamic(`email.eventMail.${kind}.message`, v),
    button: button(c.link, t.dynamic(`email.eventMail.${kind}.button`)),
    link: c.link,
  }
}

type MailOrg = { name: string; slug: string; logo_path: string | null; site_domain: string | null }

export function renderEventMail(t: T, template: Template | null, vars: Vars, org: MailOrg) {
  // Logo from our own domain (the org's own one when live), like the links: spam filters like that.
  return renderMail(template ?? builtInTemplate(t), vars, { org: org.name, logo: imageUrlOn(org.logo_path, org.site_domain) })
}

/** Sends one event mail in the org's name. False = no email provider (callers must not depend on it). */
export async function sendEventMail(kind: EventMailKind, eventId: string, c: Case, attachments?: OrgEmail["attachments"]) {
  const t = tDe()
  const { data: ev } = await createAdminClient()
    .from("events")
    .select("org_id, title, starts_at, venue_name, venue_address, own:email_templates!events_email_template_fk(subject, body, format), orgs(name, slug, logo_path, site_domain, org_modules(module_key), email_templates(subject, body, format))")
    .eq("id", eventId)
    .eq("orgs.org_modules.module_key", "email")
    .eq("orgs.email_templates.is_default", true)
    .single()
  if (!ev?.orgs) return false
  const emailOn = ev.orgs.org_modules.length > 0
  const template = emailOn ? (ev.own ?? ev.orgs.email_templates[0] ?? null) : null
  const mail = renderEventMail(t, template, eventMailVars(t, kind, ev, ev.orgs.name, c), ev.orgs)
  return sendOrgEmail(ev.org_id, { to: c.email, ...mail, attachments })
}

export type TemplateRow = Template & { name: string; is_default: boolean }
export const TEMPLATE_COLS = "id, name, subject, body, format, is_default, created_at, updated_at"

/** Create (no id) or change a template (App + API). Making it the default takes that from the org's previous one. */
export async function saveTemplate(db: SupabaseClient<Database>, orgId: string, id: string | null, row: Partial<TemplateRow>) {
  if (row.is_default) {
    const { error } = await db.from("email_templates").update({ is_default: false }).eq("org_id", orgId).eq("is_default", true).neq("id", id ?? "00000000-0000-0000-0000-000000000000")
    if (error) return { data: null, error }
  }
  return id
    ? db.from("email_templates").update(row).eq("id", id).eq("org_id", orgId).select(TEMPLATE_COLS).maybeSingle()
    : db.from("email_templates").insert({ ...(row as TemplateRow), org_id: orgId }).select(TEMPLATE_COLS).single()
}

/** A test of a template to one address: a ticket mail for a made-up event in a week. */
export async function testEventMail(orgId: string, org: MailOrg, template: Template, to: string, name: string) {
  const t = tDe()
  const ev = { title: t("email.eventMail.sampleEvent"), starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), venue_name: t("email.eventMail.sampleVenue"), venue_address: null }
  const mail = renderEventMail(t, template, eventMailVars(t, "ticket", ev, org.name, { name, email: to, count: 2, link: siteUrl(org.slug, "", org.site_domain) }), org)
  return sendOrgEmail(orgId, { to, ...mail, subject: `[Test] ${mail.subject}` })
}
