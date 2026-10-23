import { createHmac, timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import type { Integration } from "./registry"
import { getSecret } from "./server"

const toResend = (m: import("./registry").Mail) => ({
  from: m.from,
  to: m.to,
  subject: m.subject,
  text: m.text,
  html: m.html,
  headers: m.headers,
  tags: m.tags && Object.entries(m.tags).map(([name, value]) => ({ name, value })),
  attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
})

/** Tags: letters, digits, _ and - only (Resend and Brevo). */
export const tagValue = (v: unknown) => String(v).trim().replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 100)

// Everyone roots emails through an org's Resend account lands in the segment set on the connection (e.g. the org's
// ticket holders), so the org can reach them with Resend Broadcasts. Create the contact in the segment; if it exists
// already, add it. ponytail: remembered per instance so a campaign doesn't double its API calls; Resend dedupes anyway.
const added = new Set<string>()
async function addToSegment(apiKey: string, segment: string, email: string) {
  const key = `${segment}:${email.toLowerCase()}`
  if (added.has(key)) return
  const api = (path: string, body?: unknown) =>
    fetch(`https://api.resend.com${path}`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) })
  const created = await api("/contacts", { email, segments: [{ id: segment }] })
  if (!created.ok) {
    const res = await api(`/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segment)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  }
  if (added.size > 50_000) added.clear()
  added.add(key)
}

const EVENTS = { "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced", "email.complained": "complained" } as const

/** Resend signs webhooks the Svix way: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the base64 part of whsec_…. */
export function verifySvix(headers: Headers, body: string, secret: string) {
  const id = headers.get("svix-id") ?? ""
  const ts = headers.get("svix-timestamp") ?? ""
  if (!id || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new Error("stale or missing timestamp")
  const expected = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest()
  const ok = (headers.get("svix-signature") ?? "").split(" ").some((part) => {
    const sig = Buffer.from(part.split(",")[1] ?? "", "base64")
    return sig.length === expected.length && timingSafeEqual(sig, expected)
  })
  if (!ok) throw new Error("invalid signature")
  return id
}

// An org's own Resend account, so emails go out from their domain.
export const resend: Integration = {
  key: "resend",
  name: "Resend",
  fields: [
    { key: "apiKey", secret: true, placeholder: "re_…" },
    { key: "from_name", placeholder: "Coppi" },
    { key: "from_email", placeholder: "tickets@coppi.de" },
    { key: "segment", placeholder: "78261eea-8f8b-4381-83c6-79fa7120f1cf" },
  ],
  async test(secret, config) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${secret.apiKey}` },
    })
    if (!res.ok) throw new Error("integrations.resend.invalidKey")
    if (config.segment) {
      const seg = await fetch(`https://api.resend.com/segments/${encodeURIComponent(String(config.segment))}`, { headers: { Authorization: `Bearer ${secret.apiKey}` } })
      if (!seg.ok) throw new Error("integrations.resend.segmentNotFound")
    }
  },
  email: {
    async send(mail, { secret, config }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${secret.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(toResend(mail)),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
      if (config.segment) await addToSegment(secret.apiKey, String(config.segment), mail.to).catch((e) => console.error("resend segment", e))
    },
  },
  // Delivery feedback for the org's own account: register a webhook there (needs a full-access key; a sending-only
  // key just means no delivery status). roots' own account: one webhook set up by hand → RESEND_WEBHOOK_SECRET.
  async onConnected({ orgId, config, secret }) {
    if (!APP_URL.startsWith("https://")) return
    const api = (path: string, init?: RequestInit) =>
      fetch(`https://api.resend.com${path}`, { ...init, headers: { authorization: `Bearer ${secret.apiKey}`, "content-type": "application/json" }, signal: AbortSignal.timeout(15_000) })
    if (config.webhookId) await api(`/webhooks/${config.webhookId}`, { method: "DELETE" }).catch(() => {})
    const res = await api("/webhooks", { method: "POST", body: JSON.stringify({ endpoint: `${APP_URL}/api/webhooks/resend?org=${orgId}`, events: Object.keys(EVENTS) }) })
    if (!res.ok) return
    const hook = (await res.json()) as { id?: string; signing_secret?: string }
    if (!hook.id || !hook.signing_secret) return
    const { error } = await createAdminClient().rpc("save_integration", {
      p_org: orgId,
      p_provider: "resend",
      p_config: { ...config, webhookId: hook.id } as never,
      p_secret: JSON.stringify({ ...secret, webhookSecret: hook.signing_secret }),
    })
    if (error) throw error
  },
  webhook: {
    async verify(req, body) {
      const org = new URL(req.url).searchParams.get("org")
      if (org && !/^[0-9a-f-]{36}$/.test(org)) throw new Error("invalid org")
      const secret = org ? String((await getSecret(org, "resend"))?.webhookSecret ?? "") : process.env.RESEND_WEBHOOK_SECRET
      if (!secret) throw new Error("no webhook secret")
      const id = verifySvix(req.headers, body, secret)
      const payload = JSON.parse(body) as { type?: string }
      return { externalId: org ? `${org}:${id}` : id, type: payload.type, orgId: org ?? undefined, payload }
    },
    async handle(event) {
      const { type, created_at, data } = event.payload as { type: string; created_at?: string; data?: { tags?: Record<string, string> | { name: string; value: string }[]; bounce?: { type?: string } } }
      const delivery = EVENTS[type as keyof typeof EVENTS]
      const tags = Array.isArray(data?.tags) ? Object.fromEntries(data.tags.map((t) => [t.name, t.value])) : (data?.tags ?? {})
      if (!delivery || !tags.send_id) return // transactional mails (tickets, invites) aren't tracked
      const { recordDelivery } = await import("@/email/server") // dynamic: email/server → org-email → this file
      await recordDelivery(tags.send_id, delivery, { at: created_at, hard: data?.bounce?.type === "Permanent", orgId: event.orgId })
    },
  },
}
