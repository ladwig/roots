import { randomBytes, timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/url"
import type { Integration, Mail } from "./registry"
import { getSecret } from "./server"

// Brevo (EU, formerly Sendinblue): transactional email API. An org's own account (Settings → Integrations), or roots'
// own (BREVO_API_KEY, see sendPlatformEmail). Delivery feedback: a transactional webhook per connected account,
// authenticated by a random token in its URL (Brevo signs nothing); roots' own: BREVO_WEBHOOK_TOKEN, set up by hand
// with the URL <APP_URL>/api/webhooks/brevo?k=<token>.
const API = "https://api.brevo.com/v3"

/** "Club <tickets@club.de>" → { name, email } */
export const sender = (from: string) => {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() }
}

const toBrevo = (m: Mail) => ({
  sender: sender(m.from),
  to: [{ email: m.to }],
  subject: m.subject,
  htmlContent: m.html,
  textContent: m.text,
  headers: m.headers,
  // Brevo tags are plain strings: the source ("coppi-roots") as is, others as "key:value" (send_id comes back in the webhook).
  tags: m.tags && Object.entries(m.tags).map(([k, v]) => (k === "source" ? v : `${k}:${v}`)),
  attachment: m.attachments?.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString("base64") })),
})

export async function brevoSend(apiKey: string, mail: Mail) {
  const res = await fetch(`${API}/smtp/email`, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(toBrevo(mail)),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Brevo: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
}

// Brevo's event names → our delivery states (src/email/server.ts recordDelivery).
const EVENTS: Record<string, { delivery: "delivered" | "delayed" | "bounced" | "complained"; hard?: boolean }> = {
  delivered: { delivery: "delivered" },
  deferred: { delivery: "delayed" },
  soft_bounce: { delivery: "bounced" },
  hard_bounce: { delivery: "bounced", hard: true },
  blocked: { delivery: "bounced" },
  invalid_email: { delivery: "bounced", hard: true },
  spam: { delivery: "complained" },
}
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export const brevo: Integration = {
  key: "brevo",
  name: "Brevo",
  fields: [
    { key: "apiKey", secret: true, placeholder: "xkeysib-…" },
    { key: "from_name", placeholder: "Coppi" },
    { key: "from_email", placeholder: "tickets@coppi.de" },
  ],
  async test(secret) {
    const res = await fetch(`${API}/account`, { headers: { "api-key": secret.apiKey ?? "", accept: "application/json" }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error("integrations.brevo.invalidKey")
  },
  email: {
    send: (mail, { secret }) => brevoSend(secret.apiKey, mail),
  },
  // Register the delivery webhook on the org's account (replacing an earlier one of ours).
  async onConnected({ orgId, config, secret }) {
    if (!APP_URL.startsWith("https://")) return
    const api = (path: string, init?: RequestInit) =>
      fetch(`${API}${path}`, { ...init, headers: { "api-key": secret.apiKey, "content-type": "application/json", accept: "application/json" }, signal: AbortSignal.timeout(15_000) })
    if (config.webhookId) await api(`/webhooks/${config.webhookId}`, { method: "DELETE" }).catch(() => {})
    const token = randomBytes(24).toString("hex")
    const res = await api("/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: `${APP_URL}/api/webhooks/brevo?org=${orgId}&k=${token}`, type: "transactional", description: "roots delivery status", events: ["delivered", "deferred", "softBounce", "hardBounce", "blocked", "invalid", "spam"] }),
    })
    if (!res.ok) return // a key without webhook rights just means no delivery status
    const hook = (await res.json()) as { id?: number }
    if (!hook.id) return
    const { error } = await createAdminClient().rpc("save_integration", {
      p_org: orgId,
      p_provider: "brevo",
      p_config: { ...config, webhookId: hook.id } as never,
      p_secret: JSON.stringify({ ...secret, webhookToken: token }),
    })
    if (error) throw error
  },
  async disconnect({ config, secret }) {
    if (config.webhookId && secret?.apiKey)
      await fetch(`${API}/webhooks/${config.webhookId}`, { method: "DELETE", headers: { "api-key": secret.apiKey }, signal: AbortSignal.timeout(10_000) }).catch(() => {})
  },
  webhook: {
    async verify(req, body) {
      const url = new URL(req.url)
      const org = url.searchParams.get("org")
      if (org && !/^[0-9a-f-]{36}$/.test(org)) throw new Error("invalid org")
      const expected = org ? String((await getSecret(org, "brevo"))?.webhookToken ?? "") : (process.env.BREVO_WEBHOOK_TOKEN ?? "")
      if (!expected || !same(url.searchParams.get("k") ?? "", expected)) throw new Error("invalid token")
      const payload = JSON.parse(body) as { event?: string; "message-id"?: string; ts_event?: number; email?: string }
      return { externalId: `${org ?? "roots"}:${payload["message-id"]}:${payload.event}:${payload.ts_event}`, type: payload.event, orgId: org ?? undefined, payload }
    },
    async handle(event) {
      const p = event.payload as { event?: string; tags?: string[]; ts_event?: number }
      const e = EVENTS[p.event ?? ""]
      const sendId = p.tags?.find((t) => t.startsWith("send_id:"))?.slice(8)
      if (!e || !sendId) return // transactional mails (tickets, invites) aren't tracked
      const { recordDelivery } = await import("@/email/server") // dynamic: email/server → org-email → this file
      await recordDelivery(sendId, e.delivery, { at: p.ts_event ? new Date(p.ts_event * 1000).toISOString() : undefined, hard: !!e.hard, orgId: event.orgId })
    },
  },
}
