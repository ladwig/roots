// Read-only org setup an integration may need (locations, team for POST /staff, custom field definitions).
// Changing settings, integrations/webhooks, team and roles stays in the App: keys can't carry those permissions.
import { z } from "zod"
import { CUSTOM_ENTITIES, FIELD_TYPES, type CustomEntity } from "@/lib/custom-fields"
import { endpoint, uuid, type Endpoint } from "../core"
import { ts } from "./shared"

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
const LOC_COLS = "id, name, address, notes, created_at, updated_at"
const TeamMember = z.object({
  user_id: uuid,
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string().nullable().describe("Role name (German)"),
  is_owner: z.boolean(),
  joined_at: ts,
})

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
    description: "People with an account in this organisation, e.g. to add them to the shift team (POST /staff with `user_id`).",
    response: z.object({ data: z.array(TeamMember) }),
    async handler({ db, orgId }) {
      const { data: members } = await db.from("org_members").select("user_id, created_at, roles(name, is_owner)").eq("org_id", orgId).order("created_at")
      const ids = (members ?? []).map((m) => m.user_id)
      const { data: profiles } = ids.length ? await db.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] }
      const profile = new Map(profiles?.map((p) => [p.id, p]))
      return {
        data: (members ?? []).map((m) => {
          const name = m.roles?.name as Record<string, string> | string | null | undefined
          return {
            user_id: m.user_id,
            name: profile.get(m.user_id)?.full_name ?? null,
            email: profile.get(m.user_id)?.email ?? null,
            role: typeof name === "string" ? name : (name?.de ?? null),
            is_owner: !!m.roles?.is_owner,
            joined_at: m.created_at,
          }
        }),
      }
    },
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
]
