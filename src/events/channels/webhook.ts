import { createHmac } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Channel } from "../worker"

// Outgoing webhooks: POST JSON, signed like Stripe: X-Roots-Signature: t=<unix>,v1=<hmac_sha256(secret, `${t}.${body}`)>.
export const webhookChannel: Channel = {
  async send(subscription, event) {
    const url = String((subscription.config as Record<string, unknown>).url ?? "")
    if (!isAllowedUrl(url)) throw new Error("invalid webhook url")
    const { data: secret } = await createAdminClient().rpc("get_subscription_secret", { p_subscription: subscription.id })
    const body = JSON.stringify({
      id: `evt_${event.id}`,
      type: event.type,
      created_at: event.created_at,
      org_id: event.org_id,
      data: event.payload,
    })
    const t = Math.floor(Date.now() / 1000)
    const signature = createHmac("sha256", secret ?? "").update(`${t}.${body}`).digest("hex")
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Roots-Webhooks/1",
        "x-roots-event": event.type,
        "x-roots-signature": `t=${t},v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },
}

// https only, no obvious internal targets.
// ponytail: hostname check only; resolve + block private IPs (DNS rebinding) if webhooks become a risk.
export function isAllowedUrl(value: string) {
  try {
    const u = new URL(value)
    if (u.protocol !== "https:") return false
    const h = u.hostname
    return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h))
  } catch {
    return false
  }
}
