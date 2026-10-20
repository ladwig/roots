// Org setup: locations, team (roles assigned, members invited/changed/removed), custom field definitions.
// Defining roles, integrations/webhooks and API keys stays in the App. Owners are never touched here: inviting with
// an owner role, changing or removing an owner is App-only (the service-role client skips the RLS owner rules).
import { z } from "zod"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { CUSTOM_ENTITIES, FIELD_TYPES, type CustomEntity } from "@/lib/custom-fields"
import { refreshPublicFromApi } from "@/lib/public-cache"
import { createField, inviteMember, updateField, type SetupFail } from "@/settings/server"
import { deliverSoon } from "@/events/worker"
import { checkDomain, connectDomain, orgDomain, removeDomain } from "@/domains/server"
import { BLOCK_TYPES, DEFAULT_BLOCKS, readBlocks } from "@/site/blocks"
import { saveSite } from "@/site/server"
import { ApiError, dbError, endpoint, notFound, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

const en = createT("en", messages.en)
const de = createT("de", messages.de) // invite mails go out in German (the App's default language)
function fail(f: SetupFail): never {
  if (f.db) throw dbError(f.db)
  throw new ApiError(422, f.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), en.dynamic(f.error))
}
const roleName = (n: unknown) => (typeof n === "string" ? n : ((n as Record<string, string> | null)?.de ?? null))

// A role the org may assign (global or its own), never an owner role.
async function assignable(db: Db, orgId: string, roleId: string) {
  const { data } = await db.from("roles").select("is_owner").eq("id", roleId).or(`org_id.is.null,org_id.eq.${orgId}`).maybeSingle()
  if (!data) throw new ApiError(422, "invalid_role", "Unknown role (GET /roles).")
  if (data.is_owner) throw new ApiError(403, "owner_only", "Owner roles can only be given in the App, by an owner.")
}
async function member(db: Db, orgId: string, id: string) {
  const { data } = await db.from("org_members").select("id, user_id, roles(is_owner)").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  if (data.roles?.is_owner) throw new ApiError(403, "owner_only", "Owners can only be changed in the App.")
  return data
}

// ---------- custom fields ----------
const Entity = z.enum(Object.keys(CUSTOM_ENTITIES) as [CustomEntity, ...CustomEntity[]])
const CustomField = z.object({
  id: uuid,
  entity: Entity,
  key: z.string().describe("Key in the records' `custom` object; fixed once created"),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string()).describe("Choices of a select field"),
  required: z.boolean(),
  position: z.number().int(),
})
const FIELD_COLS = "id, entity, key, label, type, options, required, position"

// ---------- locations, team (read-only: settings stay in the App) ----------
const Location = z.object({ id: uuid, name: z.string(), address: z.string().nullable(), notes: z.string().nullable(), created_at: ts, updated_at: ts })
const Role = z.object({ id: uuid, name: z.string().nullable().describe("German name"), name_en: z.string().nullable(), is_owner: z.boolean(), permissions: z.array(z.string()) })
const Invite = z.object({ id: uuid, email: z.string(), role_id: uuid, expires_at: ts, created_at: ts })
const FieldBody = z.object({
  label: z.string().min(1).max(100),
  options: z.array(z.string()).optional().describe("Choices (select fields; required there)"),
  required: z.boolean().optional(),
})
const LOC_COLS = "id, name, address, notes, created_at, updated_at"
const TeamMember = z.object({
  id: uuid.describe("Membership id (PATCH/DELETE /org-members/{id})"),
  user_id: uuid,
  name: z.string().nullable(),
  email: z.string().nullable(),
  role_id: uuid,
  role: z.string().nullable().describe("Role name (German)"),
  is_owner: z.boolean(),
  joined_at: ts,
})

async function team(db: Db, orgId: string) {
  const { data: members } = await db.from("org_members").select("id, user_id, role_id, created_at, roles(name, is_owner)").eq("org_id", orgId).order("created_at")
  const ids = (members ?? []).map((m) => m.user_id)
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] }
  const profile = new Map(profiles?.map((p) => [p.id, p]))
  return {
    data: (members ?? []).map((m) => ({
      id: m.id,
      user_id: m.user_id,
      name: profile.get(m.user_id)?.full_name ?? null,
      email: profile.get(m.user_id)?.email ?? null,
      role_id: m.role_id,
      role: roleName(m.roles?.name),
      is_owner: !!m.roles?.is_owner,
      joined_at: m.created_at,
    })),
  }
}

const Site = z.object({
  tagline: z.string().nullable(),
  blocks: z.array(z.record(z.string(), z.unknown())),
  imprint: z.string().nullable(),
  privacy: z.string().nullable(),
})
const Domain = z.object({
  id: uuid,
  domain: z.string(),
  status: z.enum(["pending", "active"]).describe("active = live with https"),
  records: z.array(z.object({ type: z.enum(["CNAME", "A", "TXT"]), name: z.string().describe("Host/name field at the provider (@ = the domain itself)"), value: z.string() })).describe("What to enter at the domain provider"),
  problem: z.enum(["verify", "dns", "certificate", "removed", "unknown"]).nullable().describe("Why it isn't live yet: verify = TXT record missing, dns = not pointing to us, certificate = being issued"),
  checked_at: ts.nullable(),
  active_at: ts.nullable(),
})
const DOMAIN_ERRORS: Record<string, [number, string, string]> = {
  "domains.invalid": [422, "invalid_domain", "That isn't a usable domain (e.g. tickets.club.de)."],
  "domains.onlyOne": [409, "domain_exists", "The org already has a domain. DELETE /domain first."],
  "domains.taken": [409, "domain_taken", "Another organisation uses this domain."],
  "domains.takenElsewhere": [409, "domain_taken", "The domain is registered in another Vercel project."],
  "domains.notConfigured": [503, "not_configured", "Own domains aren't set up on this installation."],
}
const domainError = (key: string) => new ApiError(...(DOMAIN_ERRORS[key] ?? [502, "domain_failed", "The host didn't accept the change. Try again."]))

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/locations",
    permission: "shifts.view",
    tag: "Settings",
    summary: "List locations",
    description: "Places of the organisation (own venue, external venues …), used by events and shift planning.",
    response: z.object({ data: z.array(Location) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("locations").select(LOC_COLS).eq("org_id", orgId).order("name")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/team",
    permission: "shifts.manage",
    tag: "Settings",
    summary: "List the organisation's members (app users)",
    description: "People with an account in this organisation, e.g. to add them to the shift team (POST /staff with `user_id`). Same list as GET /org-members.",
    response: z.object({ data: z.array(TeamMember) }),
    handler: ({ db, orgId }) => team(db, orgId),
  }),
  endpoint({
    method: "GET",
    path: "/custom-fields",
    permission: "crm.view",
    tag: "Settings",
    summary: "List custom field definitions",
    description: "The organisation's own fields. Values live in the records' `custom` object under `key`.",
    query: z.object({ entity: Entity.default("contacts") }),
    response: z.object({ data: z.array(CustomField) }),
    async handler({ db, orgId, query }) {
      const { data } = await db.from("custom_fields").select(FIELD_COLS).eq("org_id", orgId).eq("entity", query.entity).order("position").order("created_at")
      return { data: data ?? [] }
    },
  }),

  endpoint({
    method: "POST",
    path: "/custom-fields",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Create a custom field",
    description: "Key is derived from the label and fixed afterwards, like the type. Public forms pick the field up at once.",
    body: FieldBody.extend({ entity: Entity, type: z.enum(FIELD_TYPES) }),
    response: CustomField,
    async handler({ db, orgId, body }) {
      const r = await createField(db, orgId, body)
      if ("error" in r) fail(r)
      refreshPublicFromApi(orgId)
      const { data } = await db.from("custom_fields").select(FIELD_COLS).eq("id", r.id).single()
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/custom-fields/{id}",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Change a custom field",
    description: "Label, options and required; key and type stay.",
    body: FieldBody,
    response: CustomField,
    async handler({ db, orgId, params, body }) {
      const r = await updateField(db, orgId, params.id, body)
      if ("error" in r) throw r.error === "errors.not_allowed" ? notFound() : fail(r)
      refreshPublicFromApi(orgId)
      const { data } = await db.from("custom_fields").select(FIELD_COLS).eq("id", params.id).single()
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/custom-fields/{id}",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Delete a custom field",
    description: "Stored values stay in the records (hidden); creating the field again with the same label brings them back.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("custom_fields").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      refreshPublicFromApi(orgId)
      return { id: params.id }
    },
  }),

  endpoint({
    method: "GET",
    path: "/roles",
    permission: "org.members.manage",
    tag: "Team",
    summary: "List roles",
    description: "Roles that can be given to members and invites. Roles are defined by the platform; organisations only assign them.",
    response: z.object({ data: z.array(Role) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("roles").select("id, name, is_owner, permissions").or(`org_id.is.null,org_id.eq.${orgId}`).order("created_at")
      return { data: (data ?? []).map((r) => ({ ...r, name: roleName(r.name), name_en: (r.name as Record<string, string> | null)?.en ?? null })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/org-members",
    permission: "org.members.manage",
    tag: "Team",
    summary: "List members",
    description: "People with an account in this organisation and their role (`id` = membership id for PATCH/DELETE).",
    response: z.object({ data: z.array(TeamMember) }),
    handler: ({ db, orgId }) => team(db, orgId),
  }),
  endpoint({
    method: "PATCH",
    path: "/org-members/{id}",
    permission: "org.members.manage",
    tag: "Team",
    summary: "Change a member's role",
    description: "Not for owners or owner roles (App only).",
    body: z.object({ role_id: uuid }),
    response: z.object({ id: uuid, role_id: uuid }),
    async handler({ db, orgId, params, body }) {
      await member(db, orgId, params.id)
      await assignable(db, orgId, body.role_id)
      const { error } = await db.from("org_members").update({ role_id: body.role_id }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      return { id: params.id, role_id: body.role_id }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/org-members/{id}",
    permission: "org.members.manage",
    tag: "Team",
    summary: "Remove a member",
    description: "The person loses access to this organisation (their account stays). Not for owners.",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      await member(db, orgId, params.id)
      const { error } = await db.from("org_members").delete().eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      deliverSoon()
      return { id: params.id }
    },
  }),
  endpoint({
    method: "GET",
    path: "/invites",
    permission: "org.members.manage",
    tag: "Team",
    summary: "List open invites",
    response: z.object({ data: z.array(Invite) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("invites").select("id, email, role_id, expires_at, created_at").eq("org_id", orgId).is("accepted_at", null).order("created_at")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/invites",
    permission: "org.members.manage",
    tag: "Team",
    summary: "Invite someone",
    description: "Emails an invite link (valid 7 days) for the role. An open invite to the same email is replaced. The link is returned once, e.g. to pass on if the mail didn't go out.",
    body: z.object({ email: z.string(), role_id: uuid }),
    response: z.object({ email: z.string(), link: z.string(), mail_sent: z.boolean() }),
    async handler({ db, orgId, body }) {
      await assignable(db, orgId, body.role_id)
      const { data: org } = await db.from("orgs").select("id, name").eq("id", orgId).single()
      const r = await inviteMember(db, org!, { email: body.email, roleId: body.role_id }, de)
      if ("error" in r) fail(r)
      deliverSoon()
      return { email: r.email, link: r.link, mail_sent: !r.mailFailed }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/invites/{id}",
    permission: "org.members.manage",
    tag: "Team",
    summary: "Revoke an invite",
    response: z.object({ id: uuid }),
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("invites").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId).is("accepted_at", null)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { id: params.id }
    },
  }),
  // Own domain for the public pages
  endpoint({
    method: "GET",
    path: "/domain",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Get the own domain",
    description: "The org's own domain for its public pages, whether it's live, and the DNS records to enter at the domain provider. null = none connected.",
    response: Domain.nullable(),
    handler: ({ orgId }) => orgDomain(orgId),
  }),
  endpoint({
    method: "PUT",
    path: "/domain",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Connect an own domain",
    description:
      "Adds the domain (best a subdomain like tickets.club.de) and returns the DNS records the person has to enter at their domain provider (`records`). It goes live by itself once DNS is right (checked every few minutes; POST /domain/check to check now). One domain per org.",
    body: z.object({ domain: z.string().trim().min(3).max(253).describe("e.g. tickets.club.de (a pasted URL is fine)") }).strict(),
    response: Domain,
    async handler({ orgId, body }) {
      try {
        return (await connectDomain(orgId, body.domain))!
      } catch (e) {
        throw domainError((e as Error).message)
      }
    },
  }),
  endpoint({
    method: "POST",
    path: "/domain/check",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Check the own domain now",
    description: "Asks the host whether the DNS records are in place and the certificate is issued; `status` becomes active then.",
    response: Domain,
    async handler({ orgId }) {
      const row = await checkDomain(orgId)
      if (!row) throw notFound()
      if (row.status === "active") deliverSoon()
      return row
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/domain",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Remove the own domain",
    description: "The public pages are then only reachable at the roots address.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ orgId }) {
      if (!(await removeDomain(orgId).catch(() => { throw domainError("domains.failed") }))) throw notFound()
      return { ok: true as const }
    },
  }),
  // The public start page
  endpoint({
    method: "GET",
    path: "/site",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Get the public start page",
    description: "Tagline, blocks (in order, `on` = shown) and the Impressum / Datenschutz texts. Without a saved page the start page shows the upcoming events (returned as the default blocks).",
    response: Site,
    async handler({ db, orgId }) {
      const { data } = await db.from("org_sites").select("tagline, blocks, imprint, privacy").eq("org_id", orgId).maybeSingle()
      return { tagline: data?.tagline ?? null, blocks: data ? readBlocks(data.blocks) : DEFAULT_BLOCKS, imprint: data?.imprint ?? null, privacy: data?.privacy ?? null }
    },
  }),
  endpoint({
    method: "PUT",
    path: "/site",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Change the public start page",
    description:
      "Only the given fields change; `blocks` replaces the whole list (order = page order). Block types: hero {title, text, button_label, button_href}, text {title, text (Markdown)}, links {title, items [{label, href}]}, events {title, limit} (events module), event {event_id} (one event highlighted), form {form_slug} (a published form), portal {title, text} (members module), wiki {title} (public wiki pages). Every block: {id?, type, on}. Links: https://…, mailto:, tel: or a path on the site like /e/<slug>. Invalid blocks are dropped. Goes live at once.",
    body: z
      .object({
        tagline: z.string().max(300).nullable(),
        blocks: z.array(z.object({ type: z.enum(BLOCK_TYPES.map((b) => b.type) as [string, ...string[]]) }).passthrough()).max(30),
        imprint: z.string().max(20000).nullable().describe("Markdown; required for German clubs and companies"),
        privacy: z.string().max(60000).nullable().describe("Markdown"),
      })
      .partial()
      .strict(),
    response: Site,
    async handler({ db, orgId, body }) {
      const { data, error } = await saveSite(db, orgId, body)
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId)
      return { tagline: data.tagline, blocks: readBlocks(data.blocks), imprint: data.imprint, privacy: data.privacy }
    },
  }),
]
