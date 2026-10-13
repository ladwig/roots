import { randomBytes } from "node:crypto"
import { z } from "zod"
import { isAllowedUrl } from "@/events/channels/webhook"
import { eventTypes, TEST_EVENT } from "@/events/registry"
import { deliverSoon } from "@/events/worker"
import { CUSTOM_ENTITIES, FIELD_TYPES, fieldKey, type CustomEntity } from "@/lib/custom-fields"
import { refreshPublicFromApi } from "@/lib/public-cache"
import { ApiError, dbError, endpoint, notFound, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

const Ok = z.object({ ok: z.literal(true) })

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
const Options = z.array(z.string().trim().min(1).max(100)).max(100)
const uniq = (o: string[]) => [...new Set(o)]

// ---------- event subscriptions (webhooks) ----------
const EVENT_KEYS = new Set(eventTypes.map((e) => e.key))
const EventTypes = z
  .array(z.string().max(60))
  .min(1)
  .max(100)
  .refine((a) => a.every((k) => k === "*" || EVENT_KEYS.has(k)), "Unknown event type (see GET /event-types)")
  .describe('Event types to deliver, or ["*"] for all')
const Subscription = z.object({
  id: uuid,
  name: z.string(),
  channel: z.enum(["webhook", "telegram"]),
  active: z.boolean(),
  event_types: z.array(z.string()),
  url: z.string().nullable().describe("Webhook URL (null for Telegram)"),
  chat_title: z.string().nullable().describe("Telegram chat (null for webhooks)"),
  created_at: ts,
  updated_at: ts,
})
const SUB_COLS = "id, name, channel, active, event_types, config, created_at, updated_at"
const subOut = <R extends { config: unknown }>({ config, ...s }: R) => {
  const c = (config ?? {}) as { url?: string; chat_title?: string }
  return { ...s, url: c.url ?? null, chat_title: c.chat_title ?? null }
}
const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`
const WithSecret = Subscription.extend({ secret: z.string().describe("Signing secret for the webhook signature. Shown only now: store it.") })
async function getSub(db: Db, orgId: string, id: string) {
  const { data } = await db.from("event_subscriptions").select(SUB_COLS).eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw notFound()
  return subOut(data)
}
async function setSecret(db: Db, id: string) {
  const secret = newSecret()
  const { error } = await db.rpc("set_subscription_secret", { p_subscription: id, p_secret: secret })
  if (error) throw dbError(error)
  return secret
}

// ---------- locations, team ----------
const Location = z.object({ id: uuid, name: z.string(), address: z.string().nullable(), notes: z.string().nullable(), created_at: ts, updated_at: ts })
const LOC_COLS = "id, name, address, notes, created_at, updated_at"
const LocationInput = z
  .object({ name: z.string().trim().min(1).max(100), address: z.string().trim().max(500).nullable(), notes: z.string().trim().max(2000).nullable() })
  .partial()
  .strict()
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
    method: "POST",
    path: "/locations",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Create a location",
    body: LocationInput.required({ name: true }),
    response: Location,
    status: 201,
    async handler({ db, orgId, body }) {
      const { data, error } = await db
        .from("locations")
        .insert({ org_id: orgId, name: body.name, address: body.address || null, notes: body.notes || null })
        .select(LOC_COLS)
        .single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/locations/{id}",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Change a location",
    description: "Only the given fields change; null clears address/notes.",
    body: LocationInput,
    response: Location,
    async handler({ db, orgId, params, body }) {
      const row = {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.address !== undefined && { address: body.address || null }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
      }
      const { data, error } = await db.from("locations").update(row).eq("id", params.id).eq("org_id", orgId).select(LOC_COLS).maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/locations/{id}",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Delete a location",
    response: Ok,
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("locations").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { ok: true as const }
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
  endpoint({
    method: "POST",
    path: "/custom-fields",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Create a custom field",
    description: "The key is derived from the label (409 `field_exists` if taken). Key and type can't change later.",
    body: z
      .object({
        entity: Entity.default("contacts"),
        type: z.enum(FIELD_TYPES),
        label: z.string().trim().min(1).max(100),
        options: Options.optional().describe("Required for type select"),
        required: z.boolean().default(false),
      })
      .strict(),
    response: CustomField,
    status: 201,
    async handler({ db, orgId, body }) {
      const options = body.type === "select" ? uniq(body.options ?? []) : []
      if (body.type === "select" && !options.length) throw new ApiError(422, "options_required", "A select field needs options.")
      const { count } = await db.from("custom_fields").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity", body.entity)
      const { data, error } = await db
        .from("custom_fields")
        .insert({ org_id: orgId, entity: body.entity, type: body.type, key: fieldKey(body.label), label: body.label, options, required: body.required, position: count ?? 0 })
        .select(FIELD_COLS)
        .single()
      if (error?.code === "23505") throw new ApiError(409, "field_exists", "A field with this key already exists.")
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId) // public forms show the custom fields
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/custom-fields/{id}",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Change a custom field",
    description: "Label, required and (select fields) options. Key and type stay fixed.",
    body: z.object({ label: z.string().trim().min(1).max(100), options: Options, required: z.boolean() }).partial().strict(),
    response: CustomField,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("custom_fields").select("type").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const options = old.type === "select" && body.options ? uniq(body.options) : undefined
      if (options && !options.length) throw new ApiError(422, "options_required", "A select field needs options.")
      const { data, error } = await db
        .from("custom_fields")
        .update({ ...(body.label !== undefined && { label: body.label }), ...(body.required !== undefined && { required: body.required }), ...(options && { options }) })
        .eq("id", params.id)
        .eq("org_id", orgId)
        .select(FIELD_COLS)
        .single()
      if (error) throw dbError(error)
      refreshPublicFromApi(orgId)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/custom-fields/{id}",
    permission: "org.settings.manage",
    tag: "Settings",
    summary: "Delete a custom field",
    description: "Stored values stay in the records (hidden); creating a field with the same key brings them back.",
    response: Ok,
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("custom_fields").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      refreshPublicFromApi(orgId)
      return { ok: true as const }
    },
  }),

  endpoint({
    method: "GET",
    path: "/event-types",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "Event types a subscription can receive",
    response: z.object({ data: z.array(z.object({ key: z.string(), module: z.string() })) }),
    async handler() {
      return { data: eventTypes.filter((e) => e.module !== "platform").map((e) => ({ key: e.key, module: e.module })) }
    },
  }),
  endpoint({
    method: "GET",
    path: "/event-subscriptions",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "List event subscriptions (webhooks, Telegram)",
    description: "Secrets are never returned.",
    response: z.object({ data: z.array(Subscription) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("event_subscriptions").select(SUB_COLS).eq("org_id", orgId).order("created_at")
      return { data: (data ?? []).map(subOut) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/event-subscriptions",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "Create a webhook",
    description:
      "Events are POSTed as JSON to `url` (https), signed with the returned `secret` (only shown in this response; rotate with POST /event-subscriptions/{id}/secret). Telegram subscriptions are set up in the app.",
    body: z
      .object({
        name: z.string().trim().max(100).optional(),
        url: z.string().max(2000),
        event_types: EventTypes.default(["*"]),
        active: z.boolean().default(true),
      })
      .strict(),
    response: WithSecret,
    status: 201,
    async handler({ db, orgId, body }) {
      if (!isAllowedUrl(body.url)) throw new ApiError(422, "url_invalid", "The URL must be https and public.")
      const { data, error } = await db
        .from("event_subscriptions")
        .insert({ org_id: orgId, name: body.name || "Webhook", channel: "webhook", config: { url: body.url }, event_types: body.event_types.includes("*") ? ["*"] : body.event_types, active: body.active })
        .select("id")
        .single()
      if (error) throw dbError(error)
      const secret = await setSecret(db, data.id)
      return { ...(await getSub(db, orgId, data.id)), secret }
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/event-subscriptions/{id}",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "Change an event subscription",
    description: "Only the given fields change. `url` only for webhooks.",
    body: z.object({ name: z.string().trim().min(1).max(100), url: z.string().max(2000), event_types: EventTypes, active: z.boolean() }).partial().strict(),
    response: Subscription,
    async handler({ db, orgId, params, body }) {
      const { data: sub } = await db.from("event_subscriptions").select("channel, config").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!sub) throw notFound()
      let config = sub.config as Record<string, unknown>
      if (body.url !== undefined) {
        if (sub.channel !== "webhook") throw new ApiError(422, "not_a_webhook", "Only webhooks have a URL.")
        if (!isAllowedUrl(body.url)) throw new ApiError(422, "url_invalid", "The URL must be https and public.")
        config = { ...config, url: body.url }
      }
      const { error } = await db
        .from("event_subscriptions")
        .update({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.event_types && { event_types: body.event_types.includes("*") ? ["*"] : body.event_types }),
          ...(body.active !== undefined && { active: body.active }),
          config: config as never,
        })
        .eq("id", params.id)
        .eq("org_id", orgId)
      if (error) throw dbError(error)
      return getSub(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/event-subscriptions/{id}/secret",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "Rotate a webhook's signing secret",
    description: "The old secret stops working at once. The new one is only shown in this response.",
    response: WithSecret,
    async handler({ db, orgId, params }) {
      const sub = await getSub(db, orgId, params.id)
      if (sub.channel !== "webhook") throw new ApiError(422, "not_a_webhook", "Only webhooks have a secret.")
      return { ...sub, secret: await setSecret(db, params.id) }
    },
  }),
  endpoint({
    method: "POST",
    path: "/event-subscriptions/{id}/test",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "Send a test event",
    description: `Delivers a \`${TEST_EVENT}\` event to this subscription only (within a minute).`,
    response: Ok,
    async handler({ db, orgId, params }) {
      await getSub(db, orgId, params.id)
      const { data: event, error } = await db.from("hub_events").insert({ org_id: orgId, type: TEST_EVENT, payload: { message: "Hello from roots" } }).select("id").single()
      if (error) throw dbError(error)
      const { error: deliveryError } = await db.from("event_deliveries").insert({ org_id: orgId, event_id: event.id, subscription_id: params.id })
      if (deliveryError) throw dbError(deliveryError)
      deliverSoon()
      return { ok: true as const }
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/event-subscriptions/{id}",
    permission: "org.integrations.manage",
    tag: "Settings",
    summary: "Delete an event subscription",
    response: Ok,
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("event_subscriptions").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { ok: true as const }
    },
  }),
]
