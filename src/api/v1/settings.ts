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
]
