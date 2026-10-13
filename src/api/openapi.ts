// OpenAPI 3.1 spec, generated from the endpoint definitions (same zod schemas the API validates with).
import { z } from "zod"
import { APP_URL } from "@/lib/url"
import type { Endpoint } from "./core"

const schema = (s: z.ZodType, io: "input" | "output") => z.toJSONSchema(s, { io, unrepresentable: "any" }) as Record<string, unknown>
const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) })

type Doc = Pick<Endpoint, "method" | "path" | "tag" | "summary" | "description" | "query" | "body" | "response" | "status"> & Partial<Pick<Endpoint, "upload">> & { permission?: string }
type Info = { title: string; description: string; server: string; auth: boolean }

const KEY_INFO: Info = {
  title: "roots API",
  server: "/api/v1",
  auth: true,
  description:
    "Access your organisation's data. Create an API key under Settings → API (choose its permissions and expiry). Send it as `Authorization: Bearer roots_…`. A key can do what its permissions allow, limited to what its creator may do; it is checked in the API and again in the database. Amounts are integer cents, times ISO 8601 (UTC). Lists: `limit` (≤ 100) + `offset`, `has_more` tells if there is another page. Errors: `{ error: { code, message, details? } }`.\n\nBuilding your own website? See the [public API](/api/docs?api=public) (no key).",
}

export const PUBLIC_INFO: Info = {
  title: "roots public API",
  server: "/api/public/v1",
  auth: false,
  description:
    "Everything an organisation's public pages can do, as JSON, for its own website or app (headless): events, ticket offer, ordering/sign-up with checkout, order status with tickets, waiting list, forms, guest-list links, member-area login link. No key: `{org}` is the organisation's address (slug). Open to browsers (CORS). Only published data; amounts in cents, times ISO 8601 (UTC). Messages follow the visitor's language (Accept-Language). For the organisation's own data use the [key API](/api/docs).",
}

export function openapi(endpoints: Doc[], info: Info = KEY_INFO) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const e of endpoints) {
    const pathParams = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: m[1].endsWith("id") ? { type: "string", format: "uuid" } : { type: "string" } }))
    const q = e.query ? (schema(e.query, "input") as { properties?: Record<string, Record<string, unknown>>; required?: string[] }) : null
    const queryParams = Object.entries(q?.properties ?? {}).map(([name, s]) => ({
      name,
      in: "query",
      required: q?.required?.includes(name) && !("default" in s),
      description: s.description,
      schema: s,
    }))
    paths[e.path] ??= {}
    paths[e.path][e.method.toLowerCase()] = {
      tags: [e.tag],
      summary: e.summary,
      description: [e.description, e.permission && `Permission: \`${e.permission}\``].filter(Boolean).join("\n\n"),
      parameters: [...pathParams, ...queryParams],
      ...(e.upload ? { requestBody: { required: true, description: "The image itself (JPEG, PNG, WebP, …; max. 2 MB) with its Content-Type.", content: { "image/*": { schema: { type: "string", format: "binary" } } } } } : {}),
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: schema(e.body, "input") } } } } : {}),
      responses: {
        [String(e.status ?? 200)]: { description: "OK", content: { "application/json": { schema: schema(e.response, "output") } } },
        "4XX": { description: info.auth ? "Error (401 key, 403 permission/module, 404, 400/422 validation, 409 conflict)" : "Error (404, 400/422 validation, 409 sold out / already, 503 sales not ready)", content: { "application/json": { schema: schema(ErrorBody, "output") } } },
      },
    }
  }
  return {
    openapi: "3.1.0",
    info: { title: info.title, version: "1", description: info.description },
    servers: [{ url: `${APP_URL}${info.server}` }],
    ...(info.auth ? { security: [{ apiKey: [] }], components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer", bearerFormat: "roots_…" } } } } : {}),
    paths,
  }
}
