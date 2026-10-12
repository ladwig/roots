// Server side of letters: letterhead, the contact's placeholder values, and the finished DocView for PDF/save/send.
import type { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { buildLetterView, type Seller } from "@/documents/model"
import { fieldVars, fillHtml, fillText, readFields, type Vars } from "./model"

type Ctx = Awaited<ReturnType<typeof getContext>>
type T = Awaited<ReturnType<typeof getT>>
export type LetterTemplate = { id: string; org_id: string | null; name: string; title: string; body: string; fields: unknown; letterhead: boolean }

export const longDate = (t: T, iso: string) => t.date(`${iso}T12:00:00Z`, { dateStyle: "long" })

/** Seller (invoice settings) + logo for the letterhead; falls back to the org's name. */
export async function letterhead(ctx: Ctx) {
  const { data } = await ctx.supabase.from("org_billing").select("*").eq("org_id", ctx.org.id).maybeSingle()
  const seller = (data ?? { legal_name: ctx.org.name, tax_mode: "standard" }) as Seller
  if (!seller.legal_name) seller.legal_name = ctx.org.name
  return { seller, logoUrl: (ctx.org.logo_path && imageUrl(ctx.org.logo_path)) || null }
}

/** Placeholder values + address lines for a contact of the active org (latest membership included). */
export async function contactVars(ctx: Ctx, t: T, contactId: string): Promise<{ vars: Vars; recipient: string[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(contactId)) return null
  const { data: c } = await ctx.supabase
    .from("contacts")
    .select("first_name, last_name, company, email, street, postal_code, city, memberships(member_no, starts_on, ends_on, deleted_at, membership_types(name))")
    .eq("id", contactId)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!c) return null
  const m = c.memberships.filter((x) => !x.deleted_at).sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0]
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || ""
  const place = [c.postal_code, c.city].filter(Boolean).join(" ")
  return {
    vars: {
      name,
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      company: c.company ?? "",
      email: c.email ?? "",
      street: c.street ?? "",
      postal_code: c.postal_code ?? "",
      city: c.city ?? "",
      member_number: m?.member_no ?? "",
      member_since: m ? longDate(t, m.starts_on) : "",
      member_until: m?.ends_on ? longDate(t, m.ends_on) : "",
      member_type: m?.membership_types?.name ?? "",
    },
    recipient: [c.company && name !== c.company ? c.company : "", name, c.street ?? "", place],
  }
}

/** Read a template the active org may use (its own or a default). */
export async function loadTemplate(ctx: Ctx, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await ctx.supabase.from("letter_templates").select("id, org_id, name, title, body, fields, letterhead").eq("id", id).is("deleted_at", null).maybeSingle()
  return data && (data.org_id === null || data.org_id === ctx.org.id) ? (data as LetterTemplate) : null
}

/** The filled letter from a posted form (template id, contact, date, f.<key> values), everything re-read on the server. */
export async function letterFromForm(ctx: Ctx, t: T, fd: FormData) {
  const template = await loadTemplate(ctx, String(fd.get("template") ?? ""))
  if (!template) return null
  const contactId = String(fd.get("contact") ?? "")
  const [head, contact] = await Promise.all([letterhead(ctx), contactId ? contactVars(ctx, t, contactId) : Promise.resolve(null)])
  const fields = readFields(template.fields)
  const values = Object.fromEntries(fields.map((f) => [f.key, String(fd.get(`f.${f.key}`) ?? "")]))
  const iso = String(fd.get("date") ?? "")
  const date = longDate(t, /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10))
  const vars: Vars = { ...contact?.vars, org: head.seller.legal_name ?? ctx.org.name, today: date, ...fieldVars(fields, values, (d) => longDate(t, d)) }
  const title = fillText(template.title, vars) || template.name
  const view = buildLetterView({ title, body: fillHtml(template.body, vars), recipient: contact?.recipient ?? [], date, plain: !template.letterhead }, head.seller, head.logoUrl, t)
  return { template, view, title, vars, contactId: contact ? contactId : null, email: contact?.vars.email ?? "" }
}

/** "Mitgliedsbescheinigung – Erika Muster.pdf" */
export const letterFileName = (title: string, name: string) =>
  `${[title, name]
    .filter(Boolean)
    .join(" – ")
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 150)}.pdf`
