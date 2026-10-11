// OpenAPI 3.1 spec, generated from the endpoint definitions (same zod schemas the API validates with).
import { z } from "zod"
import { APP_URL } from "@/lib/url"
import type { Endpoint } from "./core"

const schema = (s: z.ZodType, io: "input" | "output") => z.toJSONSchema(s, { io, unrepresentable: "any" }) as Record<string, unknown>
const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) })

export function openapi(endpoints: Endpoint[]) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const e of endpoints) {
    const pathParams = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string", format: "uuid" } }))
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
      description: [e.description, `Permission: \`${e.permission}\``].filter(Boolean).join("\n\n"),
      parameters: [...pathParams, ...queryParams],
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: schema(e.body, "input") } } } } : {}),
      responses: {
        [String(e.status ?? 200)]: { description: "OK", content: { "application/json": { schema: schema(e.response, "output") } } },
        "4XX": { description: "Error (401 key, 403 permission/module, 404, 400/422 validation, 409 conflict)", content: { "application/json": { schema: schema(ErrorBody, "output") } } },
      },
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "roots API",
      version: "1",
      description:
        "Access your organisation's data. Create an API key under Settings → API (choose its permissions). Send it as `Authorization: Bearer roots_…`. Amounts are integer cents, times ISO 8601 (UTC). Lists: `limit` (≤ 100) + `offset`, `has_more` tells if there is another page.",
    },
    servers: [{ url: `${APP_URL}/api/v1` }],
    security: [{ apiKey: [] }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer", bearerFormat: "roots_…" } } },
    paths,
  }
}
